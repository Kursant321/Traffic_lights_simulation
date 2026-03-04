import type { Road, SimulationInput } from "@tls/shared-types";
import { runSimulationWithDiagnostics } from "@tls/sim-core";
import type { SimulationConfig } from "@tls/sim-core";
import { writeFile } from "node:fs/promises";

type Args = {
  steps: number;
  seed: number;
  pArrive: number;
  outScenario?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { steps: 200, seed: 1, pArrive: 0.25 };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];

    const read = () => {
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${a}`);
      i += 1;
      return next;
    };

    if (a === "--steps") out.steps = Number(read());
    else if (a === "--seed") out.seed = Number(read());
    else if (a === "--p") out.pArrive = Number(read());
    else if (a === "--outScenario") out.outScenario = read();
    else if (a === "--help") {
      console.log(
        [
          "Usage:",
          "  npm -w @tls/tools run bench -- --steps 300 --seed 1 --p 0.25",
          "",
          "Options:",
          "  --steps <int>        number of simulation steps",
          "  --seed <int>         RNG seed",
          "  --p <0..1>           arrival probability per road per step",
          "  --outScenario <file> write generated scenario JSON"
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }

  if (!Number.isFinite(out.steps) || out.steps <= 0) throw new Error("Invalid --steps");
  if (!Number.isFinite(out.seed)) throw new Error("Invalid --seed");
  if (!Number.isFinite(out.pArrive) || out.pArrive < 0 || out.pArrive > 1)
    throw new Error("Invalid --p");

  return out;
}

class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  nextU32(): number {
    this.s = (1664525 * this.s + 1013904223) >>> 0;
    return this.s;
  }
  next01(): number {
    return this.nextU32() / 0xffffffff;
  }
  pick<T>(arr: readonly T[]): T {
    const idx = Math.floor(this.next01() * arr.length);
    return arr[Math.min(idx, arr.length - 1)]!;
  }
}

const roads: readonly Road[] = ["north", "east", "south", "west"] as const;

function roadToIdx(r: Road): number {
  switch (r) {
    case "north":
      return 0;
    case "east":
      return 1;
    case "south":
      return 2;
    case "west":
      return 3;
  }
}

function idxToRoad(i: number): Road {
  const arr: Road[] = ["north", "east", "south", "west"];
  return arr[i % 4]!;
}

function endRoadFromTurn(start: Road, turn: "right" | "straight" | "left"): Road {
  const i = roadToIdx(start);
  const inbound = (i + 2) % 4;

  let outHeading: number;
  if (turn === "straight") outHeading = inbound;
  else if (turn === "right") outHeading = (inbound + 1) % 4;
  else outHeading = (inbound + 3) % 4;

  return idxToRoad(outHeading);
}

function generateScenario(steps: number, pArrive: number, seed: number): SimulationInput {
  const rng = new Lcg(seed);

  const commands: SimulationInput["commands"] = [];
  let vid = 1;

  for (let t = 0; t < steps; t += 1) {
    for (const r of roads) {
      if (rng.next01() < pArrive) {
        const turn = rng.pick(["right", "straight", "left"] as const);
        const end = endRoadFromTurn(r, turn);

        commands.push({
          type: "addVehicle",
          vehicleId: `v${vid}`,
          startRoad: r,
          endRoad: end
        });

        vid += 1;
      }
    }

    commands.push({ type: "step" });
  }

  return { commands };
}

function summarize(name: string, diag: ReturnType<typeof runSimulationWithDiagnostics>) {
  return {
    mode: name,
    steps: diag.stats.steps,
    vehiclesLeft: diag.stats.vehiclesLeft,
    avgWaitSteps: Number(diag.stats.avgWaitSteps.toFixed(3)),
    maxWaitSteps: diag.stats.maxWaitSteps,
    avgQueueTotal: Number(diag.stats.avgQueueTotal.toFixed(3)),
    maxQueueTotal: diag.stats.maxQueueTotal
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input = generateScenario(args.steps, args.pArrive, args.seed);

  if (args.outScenario) {
    await writeFile(args.outScenario, JSON.stringify(input, null, 2), "utf8");
  }

  const base: Partial<SimulationConfig> = {
    throughputPerLanePerStep: 1,
    yellowSteps: 1,
    allRedSteps: 1
  };

  const diagFixed = runSimulationWithDiagnostics(input, {
    ...base,
    mode: "fixed",
    greenStepsPerPhase: 3,
    skipPhasesWithZeroDemand: true
  });

  const diagAdaptive = runSimulationWithDiagnostics(input, {
    ...base,
    mode: "adaptive",
    minGreenSteps: 1,
    maxGreenSteps: 10,
    pressureWeights: { queue: 1.0, wait: 0.05 },
    switchHysteresis: 1.1,
    starvationThresholdSteps: 30,
    starvationBonus: 1_000_000
  });

  console.log(
    `Scenario: steps=${args.steps}, pArrive=${args.pArrive}, seed=${args.seed}`
  );
  console.table([summarize("fixed", diagFixed), summarize("adaptive", diagAdaptive)]);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
