import { describe, it, expect } from "vitest";
import type { SimulationInput } from "@tls/shared-types";
import { runSimulationWithDiagnostics } from "../src/diagnostics.js";

describe("realistic mode + adaptive controller", () => {
  it("produces a YELLOW step when switching phases (yellowSteps=1)", () => {
    // Duży popyt na EW, mały na NS -> adaptive będzie chciał przełączać
    const input: SimulationInput = {
      commands: [
        { type: "addVehicle", vehicleId: "ns1", startRoad: "south", endRoad: "north" },

        { type: "addVehicle", vehicleId: "ew1", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew2", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew3", startRoad: "east", endRoad: "west" },

        { type: "step" },
        { type: "step" },
        { type: "step" },
        { type: "step" }
      ]
    };

    const diag = runSimulationWithDiagnostics(input, {
      mode: "adaptive",
      minGreenSteps: 1,
      maxGreenSteps: 10,
      pressureWeights: { queue: 1.0, wait: 0.0 },
      switchHysteresis: 1.0,

      yellowSteps: 1,
      allRedSteps: 0
    });

    // Szukamy w trace kroku, w którym faktycznie jest YELLOW.
    const hasYellow = diag.trace.some((t) => t.signal.stageKind === "YELLOW");
    expect(hasYellow).toBe(true);

    // I sprawdzamy, że w kroku YELLOW nie wypuszczamy aut
    const yellowStep = diag.trace.find((t) => t.signal.stageKind === "YELLOW");
    expect(yellowStep?.leftVehicles).toEqual([]);
  });
});