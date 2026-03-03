import { describe, it, expect } from "vitest";
import { runSimulation } from "../src/simulation.js";
import type { SimulationInput } from "@tls/shared-types";

describe("adaptive controller", () => {
  it("switches earlier than fixed when another phase has much higher demand", () => {
    const input: SimulationInput = {
      commands: [
        // NS demand: 2
        { type: "addVehicle", vehicleId: "ns1", startRoad: "south", endRoad: "north" },
        { type: "addVehicle", vehicleId: "ns2", startRoad: "south", endRoad: "north" },

        // EW demand: 5
        { type: "addVehicle", vehicleId: "ew1", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew2", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew3", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew4", startRoad: "east", endRoad: "west" },
        { type: "addVehicle", vehicleId: "ew5", startRoad: "east", endRoad: "west" },

        { type: "step" },
        { type: "step" }
      ]
    };

    const outFixed = runSimulation(input, {
      mode: "fixed",
      greenStepsPerPhase: 10, // celowo duże, żeby fixed nie przełączał szybko
      throughputPerLanePerStep: 1
    });

    const outAdaptive = runSimulation(input, {
      mode: "adaptive",
      minGreenSteps: 1,
      maxGreenSteps: 10,
      pressureWeights: { queue: 1.0, wait: 0.0 },
      switchHysteresis: 1.0,
      throughputPerLanePerStep: 1
    });

    // Fixed zostaje na NS_THROUGH przez oba kroki: przejadą ns1 i ns2
    expect(outFixed.stepStatuses[0]?.leftVehicles).toEqual(["ns1"]);
    expect(outFixed.stepStatuses[1]?.leftVehicles).toEqual(["ns2"]);

    // Adaptive: po minGreen=1 przełącza na EW_THROUGH i w 2. kroku przepuszcza ew1
    expect(outAdaptive.stepStatuses[0]?.leftVehicles).toEqual(["ns1"]);
    expect(outAdaptive.stepStatuses[1]?.leftVehicles).toEqual(["ew1"]);
  });
});
