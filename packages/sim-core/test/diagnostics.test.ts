import { describe, it, expect } from "vitest";
import type { SimulationInput } from "@tls/shared-types";
import { runSimulation } from "../src/simulation.js";
import { runSimulationWithDiagnostics } from "../src/diagnostics.js";

describe("runSimulationWithDiagnostics", () => {
  it("returns the same required output as runSimulation", () => {
    const input: SimulationInput = {
      commands: [
        { type: "addVehicle", vehicleId: "v1", startRoad: "south", endRoad: "north" },
        { type: "step" },
        { type: "step" }
      ]
    };

    const out1 = runSimulation(input);
    const out2 = runSimulationWithDiagnostics(input);

    expect(out2.output).toEqual(out1);
    expect(out2.trace).toHaveLength(2);
    expect(out2.stats.steps).toBe(2);
  });
});