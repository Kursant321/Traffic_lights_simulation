import { describe, it, expect } from "vitest";
import { runSimulation } from "../src/simulation.js";
import type { SimulationInput } from "@tls/shared-types";

describe("sample scenario from recruitment task", () => {
  it("matches expected output format and content", () => {
    const input: SimulationInput = {
      commands: [
        {
          type: "addVehicle",
          vehicleId: "vehicle1",
          startRoad: "south",
          endRoad: "north"
        },
        {
          type: "addVehicle",
          vehicleId: "vehicle2",
          startRoad: "north",
          endRoad: "south"
        },
        { type: "step" },
        { type: "step" },
        {
          type: "addVehicle",
          vehicleId: "vehicle3",
          startRoad: "west",
          endRoad: "south"
        },
        {
          type: "addVehicle",
          vehicleId: "vehicle4",
          startRoad: "west",
          endRoad: "south"
        },
        { type: "step" },
        { type: "step" }
      ]
    };

    const output = runSimulation(input);

    expect(output).toEqual({
      stepStatuses: [
        { leftVehicles: ["vehicle1", "vehicle2"] },
        { leftVehicles: [] },
        { leftVehicles: ["vehicle3"] },
        { leftVehicles: ["vehicle4"] }
      ]
    });
  });
});
