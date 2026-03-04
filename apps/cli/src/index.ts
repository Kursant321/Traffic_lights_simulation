#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { SimulationInputSchema } from "@tls/shared-types";
import {
  runSimulation,
  runSimulationWithDiagnostics,
  type SimulationConfig,
  type ControllerMode
} from "@tls/sim-core";

type Opts = {
  mode?: ControllerMode;
  diagnosticsPath?: string;
  yellowSteps?: number;
  allRedSteps?: number;
};

function usage(): string {
  return [
    "Usage:",
    "  tls-sim <input.json> <output.json> [options]",
    "",
    "Options:",
    "  --mode <fixed|adaptive>",
    "  --diagnostics <diagnostics.json>   Write diagnostics JSON to a separate file",
    "  --yellowSteps <n>",
    "  --allRedSteps <n>",
    "",
    "Examples:",
    "  npm run sim -- examples/sample-input.json out.json",
    "  npm run sim:realistic -- examples/sample-input.json out.json",
    "  npm run sim -- examples/sample-input.json out.json --mode adaptive",
    "  npm run sim -- examples/sample-input.json out.json --diagnostics diag.json"
  ].join("\n");
}

function parseArgs(argv: string[]): { positionals: string[]; opts: Opts } {
  const positionals: string[] = [];
  const opts: Opts = {};

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }

    const key = a.slice(2);
    const next = argv[i + 1];

    const readValue = (): string | undefined => {
      if (next === undefined) return undefined;
      if (next.startsWith("--")) return undefined;
      i += 1;
      return next;
    };

    if (key === "mode") {
      const v = readValue();
      if (v === "fixed" || v === "adaptive") opts.mode = v;
      else throw new Error(`Invalid --mode value: ${v ?? "(missing)"}`);
    } else if (key === "diagnostics") {
      const v = readValue();
      if (!v) throw new Error("Missing value for --diagnostics");
      opts.diagnosticsPath = v;
    } else if (key === "yellowSteps") {
      const v = readValue();
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new Error(`Invalid --yellowSteps value: ${v ?? "(missing)"}`);
      }
      opts.yellowSteps = n;
    } else if (key === "allRedSteps") {
      const v = readValue();
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new Error(`Invalid --allRedSteps value: ${v ?? "(missing)"}`);
      }
      opts.allRedSteps = n;
    } else if (key === "help" || key === "h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: --${key}`);
    }
  }

  return { positionals, opts };
}

async function main(): Promise<void> {
  const { positionals, opts } = parseArgs(process.argv.slice(2));
  const [inputPath, outputPath] = positionals;

  if (!inputPath || !outputPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const cfg: Partial<SimulationConfig> = {};
  if (opts.mode) cfg.mode = opts.mode;
  if (opts.yellowSteps !== undefined) cfg.yellowSteps = opts.yellowSteps;
  if (opts.allRedSteps !== undefined) cfg.allRedSteps = opts.allRedSteps;

  try {
    const raw = await readFile(inputPath, "utf8");
    const parsedJson = JSON.parse(raw);
    const input = SimulationInputSchema.parse(parsedJson);

    if (opts.diagnosticsPath) {
      const diag = runSimulationWithDiagnostics(input, cfg);
      // Output file MUST keep the required format
      await writeFile(outputPath, JSON.stringify(diag.output, null, 2), "utf8");
      await writeFile(opts.diagnosticsPath, JSON.stringify(diag, null, 2), "utf8");
      return;
    }

    const output = runSimulation(input, cfg);
    await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

await main();
