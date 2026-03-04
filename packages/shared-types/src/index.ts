import { z } from "zod";



export const RoadSchema = z.enum(["north", "south", "east", "west"]);
export type Road = z.infer<typeof RoadSchema>;

export const TurnSchema = z.enum(["right", "straight", "left"]);
export type Turn = z.infer<typeof TurnSchema>;

export type VehicleId = string;



export const AddVehicleCommandSchema = z.object({
  type: z.literal("addVehicle"),
  vehicleId: z.string().min(1),
  startRoad: RoadSchema,
  endRoad: RoadSchema
});
export type AddVehicleCommand = z.infer<typeof AddVehicleCommandSchema>;

export const StepCommandSchema = z.object({
  type: z.literal("step")
});
export type StepCommand = z.infer<typeof StepCommandSchema>;

export const CommandSchema = z.discriminatedUnion("type", [
  AddVehicleCommandSchema,
  StepCommandSchema
]);
export type Command = z.infer<typeof CommandSchema>;

export const SimulationInputSchema = z.object({
  commands: z.array(CommandSchema)
});
export type SimulationInput = z.infer<typeof SimulationInputSchema>;



export const StepStatusSchema = z.object({
  leftVehicles: z.array(z.string())
});
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const SimulationOutputSchema = z.object({
  stepStatuses: z.array(StepStatusSchema)
});
export type SimulationOutput = z.infer<typeof SimulationOutputSchema>;



const dirIndex: Record<Road, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3
};

function opposite(idx: number): number {
  return (idx + 2) % 4;
}

/**
 * Wyliczam manewr na podstawie:
 * - startRoad: strona, z której pojazd wjeżdża (np. "west" → jedzie na wschód)
 * - endRoad: strona, na którą pojazd wyjeżdża (np. "south" → jedzie na południe)
 *
 * U-turn (startRoad === endRoad) traktuję jako błąd wejścia.
 */
export function computeTurn(startRoad: Road, endRoad: Road): Turn {
  if (startRoad === endRoad) {
    throw new Error(
      `Invalid route: startRoad === endRoad (${startRoad}). U-turn is not supported.`
    );
  }

  const inboundHeading = opposite(dirIndex[startRoad]);
  const outboundHeading = dirIndex[endRoad];

  const delta = (outboundHeading - inboundHeading + 4) % 4;

  if (delta === 0) return "straight";
  if (delta === 1) return "right";
  if (delta === 3) return "left";
  if (delta === 2) return "straight";

  throw new Error(`Unexpected turn delta=${delta} for route ${startRoad} -> ${endRoad}`);
}
