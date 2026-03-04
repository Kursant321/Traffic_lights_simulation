import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { SimulationInputSchema } from "@tls/shared-types";
import {
  runSimulation,
  runSimulationWithDiagnostics,
  type SimulationConfig,
  type ControllerMode
} from "@tls/sim-core";

function getQueryParam(req: FastifyRequest, key: string): string | undefined {
  const q = req.query;
  if (typeof q !== "object" || q === null) return undefined;
  if (!(key in q)) return undefined;

  const raw = (q as Record<string, unknown>)[key];
  if (raw === undefined || raw === null) return undefined;

  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "boolean") return raw ? "true" : "false";

  return undefined;
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return !(s === "0" || s === "false" || s === "no" || s === "off");
}

function parseMode(v: string | undefined): ControllerMode | undefined {
  if (!v) return undefined;
  if (v === "fixed" || v === "adaptive") return v;
  return undefined;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.post("/simulate", async (req, reply) => {
  const diagnostics = parseBool(getQueryParam(req, "diagnostics"));
  const mode = parseMode(getQueryParam(req, "mode"));

  const parsed = SimulationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid input JSON",
      details: parsed.error.issues
    });
  }

  const cfg: Partial<SimulationConfig> = {};
  if (mode) cfg.mode = mode;

  if (diagnostics) {
    return reply.send(runSimulationWithDiagnostics(parsed.data, cfg));
  }

  return reply.send(runSimulation(parsed.data, cfg));
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });