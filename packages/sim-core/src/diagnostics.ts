import type {
  Road,
  VehicleId,
  SimulationInput,
  SimulationOutput
} from "@tls/shared-types";
import {
  Simulation,
  type SimulationConfig,
  type Lane,
  type GreenPhaseId
} from "./simulation.js";

export type StageKind = "GREEN" | "YELLOW" | "ALL_RED";

export interface SignalSnapshot {
  stageKind: StageKind;
  activePhase: GreenPhaseId | null; // null gdy YELLOW/ALL_RED
  nextPhase: GreenPhaseId | null;
  remainingSteps: number | null;
  greenAgeSteps: number;
}

export type QueueSizes = Record<Road, Record<Lane, number>>;

export interface StepTrace {
  stepIndex: number;
  signal: SignalSnapshot;
  queueSizesBefore: QueueSizes;
  queueSizesAfter: QueueSizes;
  leftVehicles: VehicleId[];
}

export interface SimulationStats {
  steps: number;
  vehiclesLeft: number;
  totalWaitSteps: number;
  avgWaitSteps: number;
  maxWaitSteps: number;

  avgQueueTotal: number;
  maxQueueTotal: number;
}

export interface SimulationDiagnostics {
  output: SimulationOutput;
  trace: StepTrace[];
  stats: SimulationStats;
}

function emptyQueueSizes(): QueueSizes {
  return {
    north: { left: 0, through: 0, right: 0 },
    south: { left: 0, through: 0, right: 0 },
    east: { left: 0, through: 0, right: 0 },
    west: { left: 0, through: 0, right: 0 }
  };
}

function sumQueueTotal(q: QueueSizes): number {
  let s = 0;
  for (const road of Object.keys(q) as Road[]) {
    s += q[road].left + q[road].through + q[road].right;
  }
  return s;
}

export function runSimulationWithDiagnostics(
  input: SimulationInput,
  cfg?: Partial<SimulationConfig>
): SimulationDiagnostics {
  const sim = new Simulation(cfg);

  const trace: StepTrace[] = [];

  let steps = 0;
  let vehiclesLeft = 0;

  let totalWaitSteps = 0;
  let maxWaitSteps = 0;

  let queueTotalSum = 0;
  let maxQueueTotal = 0;

  const stepStatuses: SimulationOutput["stepStatuses"] = [];

  // Wewnętrzny dostęp do diagnostyki: wykorzystuje publiczne API symulacji,
  // ale wymaga od Simulation dodatkowych metod (dodamy je w następnym kroku).
  for (const cmd of input.commands) {
    if (cmd.type === "addVehicle") {
      sim.addVehicle(cmd);
      continue;
    }

    if (cmd.type !== "step") continue;

    const before = sim.getQueueSizes();
    const queueTotalBefore = sumQueueTotal(before);
    queueTotalSum += queueTotalBefore;
    maxQueueTotal = Math.max(maxQueueTotal, queueTotalBefore);

    const { status, signal, waitStepsOfLeft, maxWaitInLeft } = sim.stepWithMeta();

    const after = sim.getQueueSizes();

    stepStatuses.push(status);

    vehiclesLeft += status.leftVehicles.length;
    totalWaitSteps += waitStepsOfLeft;
    maxWaitSteps = Math.max(maxWaitSteps, maxWaitInLeft, maxWaitSteps);

    trace.push({
      stepIndex: steps,
      signal,
      queueSizesBefore: before,
      queueSizesAfter: after,
      leftVehicles: status.leftVehicles
    });

    steps += 1;
  }

  const avgWaitSteps = vehiclesLeft > 0 ? totalWaitSteps / vehiclesLeft : 0;
  const avgQueueTotal = steps > 0 ? queueTotalSum / steps : 0;

  return {
    output: { stepStatuses },
    trace,
    stats: {
      steps,
      vehiclesLeft,
      totalWaitSteps,
      avgWaitSteps,
      maxWaitSteps,
      avgQueueTotal,
      maxQueueTotal
    }
  };
}

// Użyteczne, gdy potrzebny jest pusty obiekt do porównań w testach
export const _internal = { emptyQueueSizes };
