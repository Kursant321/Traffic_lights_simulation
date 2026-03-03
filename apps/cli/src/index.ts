#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { SimulationInputSchema } from "@tls/shared-types";
import { runSimulation } from "@tls/sim-core";

function usage(): string {
  return [
    "Usage:",
    "  tls-sim <input.json> <output.json>",
    "",
    "Example:",
    "  tls-sim examples/sample-input.json out.json"
  ].join("\n");
}

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    const raw = await readFile(inputPath, "utf8");
    const parsedJson = JSON.parse(raw);

    const input = SimulationInputSchema.parse(parsedJson);
    const output = runSimulation(input);

    await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

await main();
