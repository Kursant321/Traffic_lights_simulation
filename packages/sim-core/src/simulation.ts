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

type Stage =
  | { kind: "GREEN"; phase: GreenPhaseId }
  | { kind: "YELLOW"; next: GreenPhaseId; remainingSteps: number }
  | { kind: "ALL_RED"; next: GreenPhaseId; remainingSteps: number };

interface Vehicle {
  id: VehicleId;
  startRoad: Road;
  endRoad: Road;
  turn: Turn;
  seq: number; // pilnuję stabilnego porządku w leftVehicles
}

interface SimulationConfig {
  throughputPerLanePerStep: number;
  greenStepsPerPhase: number;
  yellowSteps: number;
  allRedSteps: number;
  skipPhasesWithZeroDemand: boolean;
}

const DEFAULT_CONFIG: SimulationConfig = {
  throughputPerLanePerStep: 1,
  greenStepsPerPhase: 2,
  yellowSteps: 0,
  allRedSteps: 0,
  skipPhasesWithZeroDemand: true
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
      seq: this.nextVehicleSeq++
    };

    this.seenVehicleIds.add(v.id);
    this.queues.enqueue(v);
  }

  public step(): StepStatus {
    // Jeśli jestem w YELLOW / ALL_RED, to tylko odliczam i nie przepuszczam aut.
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

      return { leftVehicles: [] };
    }

    // --- GAP-OUT: jeżeli moja faza ma 0 aut, a jakaś inna ma popyt, to przełączam się od razu.
    // Dzięki temu przykład z polecenia działa naturalnie.
    const currentDemand = this.queues.demandForPhase(this.stage.phase);
    if (currentDemand === 0) {
      const next = this.pickNextPhase(this.stage.phase);
      if (next !== this.stage.phase) {
        this.switchTo(next);
      }
    }

    // Po ewentualnym switchu nadal mogę być w GREEN albo wejść w YELLOW/ALL_RED.
    if (this.stage.kind !== "GREEN") {
      return { leftVehicles: [] };
    }

    // GREEN: przepuszczam auta zgodnie z fazą.
    const left = this.dischargeVehicles(this.stage.phase);

    // Zwiększam czas trwania zielonego.
    this.greenAgeSteps += 1;

    // Jeżeli czas zielonego się skończył → przełączam na kolejną fazę.
    if (this.greenAgeSteps >= this.cfg.greenStepsPerPhase) {
      const next = this.pickNextPhase(this.stage.phase);
      if (next !== this.stage.phase) {
        this.switchTo(next);
      } else {
        this.greenAgeSteps = 0;
      }
    }

    // Stabilny porządek leftVehicles: sortuję po kolejności dodania.
    left.sort((a, b) => a.seq - b.seq);

    return { leftVehicles: left.map((v) => v.id) };
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
