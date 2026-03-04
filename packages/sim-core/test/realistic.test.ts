import { describe, it, expect } from "vitest";
import type { SimulationInput } from "@tls/shared-types";
import { runSimulationWithDiagnostics } from "../src/diagnostics.js";

describe("realistic mode (yellow/all-red)", () => {
  it("introduces a non-discharge step during phase switching when yellowSteps=1", () => {
    const input: SimulationInput = {
      commands: [
        { type: "addVehicle", vehicleId: "ns1", startRoad: "south", endRoad: "north" },
        { type: "step" }, // przepuszcza ns1 (GREEN)
        { type: "step" }, // nadal może być GREEN
        { type: "step" } // przełączenie fazy -> YELLOW -> brak przepuszczania
      ]
    };

    const diag = runSimulationWithDiagnostics(input, {
      mode: "fixed",
      greenStepsPerPhase: 1,
      yellowSteps: 1,
      allRedSteps: 0,
      skipPhasesWithZeroDemand: false
    });

    expect(diag.output.stepStatuses[0]?.leftVehicles).toEqual(["ns1"]);

    // w którymś z kolejnych kroków powinien być pusty przejazd (YELLOW)
    expect(diag.output.stepStatuses[2]?.leftVehicles).toEqual([]);

    expect(diag.trace[2]?.signal.stageKind).toBe("YELLOW");
  });
});
