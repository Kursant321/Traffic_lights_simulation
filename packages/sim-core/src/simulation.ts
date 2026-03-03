import type {
  Road,
  Turn,
  VehicleId,
  SimulationInput,
  SimulationOutput,
  StepStatus,
  AddVehicleCommand
} from "@tls/shared-types";
import { computeTurn } from "@tls/shared-types";

type Lane = "left" | "through" | "right";
type GreenPhaseId = "NS_THROUGH" | "EW_THROUGH" | "NS_LEFT" | "EW_LEFT";
export type ControllerMode = "fixed" | "adaptive";

type Stage =
  | { kind: "GREEN"; phase: GreenPhaseId }
  | { kind: "YELLOW"; next: GreenPhaseId; remainingSteps: number }
  | { kind: "ALL_RED"; next: GreenPhaseId; remainingSteps: number };

interface Vehicle {
  id: VehicleId;
  startRoad: Road;
  endRoad: Road;
  turn: Turn;
  seq: number;
  arrivalStep: number;
}

export interface SimulationConfig {
  // Shared
  mode: ControllerMode;
  throughputPerLanePerStep: number;
  yellowSteps: number;
  allRedSteps: number;
  skipPhasesWithZeroDemand: boolean;

  // Fixed-cycle
  greenStepsPerPhase: number;

  // Adaptive
  minGreenSteps: number;
  maxGreenSteps: number;
  pressureWeights: { queue: number; wait: number };
  switchHysteresis: number; // np. 1.1 oznacza: przełącz dopiero gdy best >= current*1.1
  starvationThresholdSteps: number;
  starvationBonus: number; // duży bonus do score, gdy max wait przekroczy threshold
}

const DEFAULT_CONFIG: SimulationConfig = {
  mode: "fixed",
  throughputPerLanePerStep: 1,

  // Fixed defaults (pasują do przykładu z treści)
  greenStepsPerPhase: 2,

  // Safety buffers (domyślnie 0, żeby nie dodawać pustych kroków)
  yellowSteps: 0,
  allRedSteps: 0,

  skipPhasesWithZeroDemand: true,

  // Adaptive defaults (używane tylko gdy mode="adaptive")
  minGreenSteps: 1,
  maxGreenSteps: 10,
  pressureWeights: { queue: 1.0, wait: 0.05 },
  switchHysteresis: 1.1,
  starvationThresholdSteps: 30,
  starvationBonus: 1_000_000
};

function laneForTurn(turn: Turn): Lane {
  if (turn === "left") return "left";
  if (turn === "straight") return "through";
  return "right";
}

class ApproachQueues {
  private readonly q: Record<Road, Record<Lane, Vehicle[]>>;

  public constructor() {
    this.q = {
      north: { left: [], through: [], right: [] },
      south: { left: [], through: [], right: [] },
      east: { left: [], through: [], right: [] },
      west: { left: [], through: [], right: [] }
    };
  }

  public enqueue(v: Vehicle): void {
    const lane = laneForTurn(v.turn);
    this.q[v.startRoad][lane].push(v);
  }

  public size(road: Road, lane: Lane): number {
    return this.q[road][lane].length;
  }

  public popMany(road: Road, lane: Lane, count: number): Vehicle[] {
    if (count <= 0) return [];
    const arr = this.q[road][lane];
    return arr.splice(0, count);
  }

  public demandForPhase(phase: GreenPhaseId): number {
    const allowed = allowedMovementsForPhase(phase);
    let sum = 0;
    for (const { road, lanes } of allowed) {
      for (const lane of lanes) sum += this.size(road, lane);
    }
    return sum;
  }

  public listVehiclesForPhase(phase: GreenPhaseId): Vehicle[] {
    const allowed = allowedMovementsForPhase(phase);
    const out: Vehicle[] = [];
    for (const { road, lanes } of allowed) {
      for (const lane of lanes) {
        out.push(...this.q[road][lane]);
      }
    }
    return out;
  }
}

function allowedMovementsForPhase(
  phase: GreenPhaseId
): Array<{ road: Road; lanes: Lane[] }> {
  switch (phase) {
    case "NS_THROUGH":
      return [
        { road: "north", lanes: ["through", "right"] },
        { road: "south", lanes: ["through", "right"] }
      ];
    case "EW_THROUGH":
      return [
        { road: "east", lanes: ["through", "right"] },
        { road: "west", lanes: ["through", "right"] }
      ];
    case "NS_LEFT":
      return [
        { road: "north", lanes: ["left"] },
        { road: "south", lanes: ["left"] }
      ];
    case "EW_LEFT":
      return [
        { road: "east", lanes: ["left"] },
        { road: "west", lanes: ["left"] }
      ];
  }
}

const FIXED_CYCLE: readonly GreenPhaseId[] = [
  "NS_THROUGH",
  "EW_THROUGH",
  "NS_LEFT",
  "EW_LEFT"
] as const;

export class Simulation {
  private readonly cfg: SimulationConfig;
  private readonly queues = new ApproachQueues();
  private readonly seenVehicleIds = new Set<string>();

  private stage: Stage = { kind: "GREEN", phase: "NS_THROUGH" };
  private greenAgeSteps = 0;

  private nextVehicleSeq = 1;
  private currentStep = 0;

  public constructor(cfg?: Partial<SimulationConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
  }

  public addVehicle(cmd: AddVehicleCommand): void {
    if (this.seenVehicleIds.has(cmd.vehicleId)) {
      throw new Error(`Duplicate vehicleId: ${cmd.vehicleId}`);
    }

    const turn = computeTurn(cmd.startRoad, cmd.endRoad);
    const v: Vehicle = {
      id: cmd.vehicleId,
      startRoad: cmd.startRoad,
      endRoad: cmd.endRoad,
      turn,
      seq: this.nextVehicleSeq++,
      arrivalStep: this.currentStep
    };

    this.seenVehicleIds.add(v.id);
    this.queues.enqueue(v);
  }

  public step(): StepStatus {
    // YELLOW / ALL_RED: tylko odliczanie, bez przepuszczania pojazdów
    if (this.stage.kind !== "GREEN") {
      this.stage.remainingSteps -= 1;

      if (this.stage.remainingSteps <= 0) {
        if (this.stage.kind === "YELLOW") {
          this.stage = {
            kind: "ALL_RED",
            next: this.stage.next,
            remainingSteps: this.cfg.allRedSteps
          };
        } else {
          this.stage = { kind: "GREEN", phase: this.stage.next };
          this.greenAgeSteps = 0;
        }
      }

      this.currentStep += 1;
      return { leftVehicles: [] };
    }

    // Decyzja o fazie (fixed/adaptive) jest podejmowana przed rozładowaniem kolejek.
    this.maybeSwitchPhaseBeforeDischarge();

    // Jeśli switch włączył YELLOW/ALL_RED, w tym kroku nic nie przejeżdża
    if (this.stage.kind !== "GREEN") {
      this.currentStep += 1;
      return { leftVehicles: [] };
    }

    const discharged = this.dischargeVehicles(this.stage.phase);

    // Stabilny porządek: rosnąco wg kolejności dodania
    discharged.sort((a, b) => a.seq - b.seq);

    this.greenAgeSteps += 1;

    // Zakończenie kroku
    this.currentStep += 1;

    return { leftVehicles: discharged.map((v) => v.id) };
  }

  private maybeSwitchPhaseBeforeDischarge(): void {
    if (this.stage.kind !== "GREEN") return;

    const current = this.stage.phase;
    const currentDemand = this.queues.demandForPhase(current);

    // Gap-out: gdy brak popytu na aktualnej fazie, można przełączyć natychmiast
    if (currentDemand === 0) {
      const next = this.pickNextPhase(current);
      if (next !== current) this.switchTo(next);
      return;
    }

    if (this.cfg.mode === "fixed") {
      // Fixed-cycle: przełącza po greenStepsPerPhase
      if (this.greenAgeSteps >= this.cfg.greenStepsPerPhase) {
        const next = this.pickNextPhase(current);
        if (next !== current) this.switchTo(next);
        else this.greenAgeSteps = 0;
      }
      return;
    }

    // Adaptive
    if (this.greenAgeSteps < this.cfg.minGreenSteps) return;

    const scoreCurrent = this.phaseScore(current);
    const best = this.bestPhaseByScore(current);

    if (best === current) {
      if (this.greenAgeSteps >= this.cfg.maxGreenSteps) this.greenAgeSteps = 0;
      return;
    }

    const scoreBest = this.phaseScore(best);

    // Starvation: jeśli best ma bardzo długo czekające pojazdy, score dostaje bonus i przełączenie następuje naturalnie
    const shouldSwitchByPressure = scoreBest >= scoreCurrent * this.cfg.switchHysteresis;
    const shouldSwitchByMaxGreen =
      this.greenAgeSteps >= this.cfg.maxGreenSteps &&
      this.queues.demandForPhase(best) > 0;

    if (shouldSwitchByPressure || shouldSwitchByMaxGreen) {
      this.switchTo(best);
    }
  }

  private phaseScore(phase: GreenPhaseId): number {
    const vehicles = this.queues.listVehiclesForPhase(phase);
    if (vehicles.length === 0) return 0;

    const queueSum = vehicles.length;

    let waitSum = 0;
    let maxWait = 0;

    for (const v of vehicles) {
      const w = this.currentStep - v.arrivalStep;
      waitSum += w;
      if (w > maxWait) maxWait = w;
    }

    let score =
      this.cfg.pressureWeights.queue * queueSum + this.cfg.pressureWeights.wait * waitSum;

    if (maxWait >= this.cfg.starvationThresholdSteps) {
      score += this.cfg.starvationBonus;
    }

    return score;
  }

  private bestPhaseByScore(current: GreenPhaseId): GreenPhaseId {
    let best = current;
    let bestScore = this.phaseScore(best);

    for (const phase of FIXED_CYCLE) {
      const s = this.phaseScore(phase);
      if (s > bestScore) {
        best = phase;
        bestScore = s;
      }
    }

    return best;
  }

  private dischargeVehicles(phase: GreenPhaseId): Vehicle[] {
    const allowed = allowedMovementsForPhase(phase);
    const discharged: Vehicle[] = [];

    for (const { road, lanes } of allowed) {
      for (const lane of lanes) {
        const popped = this.queues.popMany(road, lane, this.cfg.throughputPerLanePerStep);
        discharged.push(...popped);
      }
    }

    return discharged;
  }

  private pickNextPhase(current: GreenPhaseId): GreenPhaseId {
    const idx = FIXED_CYCLE.indexOf(current);
    if (idx < 0) return "NS_THROUGH";

    for (let offset = 1; offset <= FIXED_CYCLE.length; offset += 1) {
      const cand = FIXED_CYCLE[(idx + offset) % FIXED_CYCLE.length]!;
      if (!this.cfg.skipPhasesWithZeroDemand) return cand;

      const demand = this.queues.demandForPhase(cand);
      if (demand > 0) return cand;
    }

    return current;
  }

  private switchTo(next: GreenPhaseId): void {
    this.greenAgeSteps = 0;

    if (this.cfg.yellowSteps > 0) {
      this.stage = { kind: "YELLOW", next, remainingSteps: this.cfg.yellowSteps };
    } else if (this.cfg.allRedSteps > 0) {
      this.stage = { kind: "ALL_RED", next, remainingSteps: this.cfg.allRedSteps };
    } else {
      this.stage = { kind: "GREEN", phase: next };
    }
  }
}

export function runSimulation(
  input: SimulationInput,
  cfg?: Partial<SimulationConfig>
): SimulationOutput {
  const sim = new Simulation(cfg);
  const stepStatuses: StepStatus[] = [];

  for (const cmd of input.commands) {
    if (cmd.type === "addVehicle") sim.addVehicle(cmd);
    else if (cmd.type === "step") stepStatuses.push(sim.step());
  }

  return { stepStatuses };
}
