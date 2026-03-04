import React, { useMemo, useState } from "react";

type Mode = "fixed" | "adaptive";

type SimOutput = {
  stepStatuses: Array<{ leftVehicles: string[] }>;
};

type Diagnostics = {
  output: SimOutput;
  trace: Array<{
    stepIndex: number;
    signal: {
      stageKind: "GREEN" | "YELLOW" | "ALL_RED";
      activePhase: string | null;
      nextPhase: string | null;
      remainingSteps: number | null;
      greenAgeSteps: number;
    };
    queueSizesBefore: Record<string, Record<string, number>>;
    queueSizesAfter: Record<string, Record<string, number>>;
    leftVehicles: string[];
  }>;
  stats: {
    steps: number;
    vehiclesLeft: number;
    totalWaitSteps: number;
    avgWaitSteps: number;
    maxWaitSteps: number;
    avgQueueTotal: number;
    maxQueueTotal: number;
  };
};

const SAMPLE = `{
  "commands": [
    { "type": "addVehicle", "vehicleId": "vehicle1", "startRoad": "south", "endRoad": "north" },
    { "type": "addVehicle", "vehicleId": "vehicle2", "startRoad": "north", "endRoad": "south" },
    { "type": "step" },
    { "type": "step" },
    { "type": "addVehicle", "vehicleId": "vehicle3", "startRoad": "west", "endRoad": "south" },
    { "type": "addVehicle", "vehicleId": "vehicle4", "startRoad": "west", "endRoad": "south" },
    { "type": "step" },
    { "type": "step" }
  ]
}`;

function isDiagnostics(x: unknown): x is Diagnostics {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return "stats" in obj && typeof obj.stats === "object" && obj.stats !== null;
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>("fixed");
  const [diagnostics, setDiagnostics] = useState<boolean>(true);
  const [input, setInput] = useState<string>(SAMPLE);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [rawResponse, setRawResponse] = useState<string>("");

  const parsed = useMemo(() => {
    try {
      return JSON.parse(rawResponse) as unknown;
    } catch {
      return null;
    }
  }, [rawResponse]);

  async function run(): Promise<void> {
    setError("");
    setLoading(true);
    setRawResponse("");

    let body: unknown;
    try {
      body = JSON.parse(input);
    } catch {
      setLoading(false);
      setError("Input is not valid JSON.");
      return;
    }

    const params = new URLSearchParams();
    params.set("mode", mode);
    if (diagnostics) params.set("diagnostics", "1");

    try {
      const res = await fetch(`/simulate?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });

      const text = await res.text();
      if (!res.ok) {
        setLoading(false);
        setError(`HTTP ${res.status}: ${text}`);
        return;
      }

      setRawResponse(JSON.stringify(JSON.parse(text), null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const diag = isDiagnostics(parsed) ? parsed : null;
  const out = diag ? diag.output : (parsed as SimOutput | null);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 style={{ margin: 0 }}>Traffic Lights Simulation</h2>
          <div className="badge">Web UI (Vite + React) → API (/simulate)</div>
        </div>

        <div className="row" style={{ margin: 0 }}>
          <label>
            Mode{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="fixed">fixed</option>
              <option value="adaptive">adaptive</option>
            </select>
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={diagnostics}
              onChange={(e) => setDiagnostics(e.target.checked)}
            />
            diagnostics
          </label>

          <button onClick={run} disabled={loading}>
            {loading ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ borderColor: "#7f1d1d", background: "#1f0b0b" }}>
          <b>Error</b>
          <div className="small">{error}</div>
        </div>
      ) : null}

      <div className="grid">
        <div className="card">
          <div className="row">
            <b>Input JSON</b>
            <span className="small">Paste commands here</span>
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} />
        </div>

        <div className="card">
          <div className="row">
            <b>Response</b>
            <span className="small">
              {diag ? "diagnostics + output" : out ? "output" : "—"}
            </span>
          </div>

          <pre>{rawResponse || "Run the simulation to see output here."}</pre>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="row">
            <b>Summary</b>
            <span className="small">Derived from diagnostics (if enabled)</span>
          </div>

          {diag ? (
            <div className="kv">
              <div>steps</div>
              <div>{diag.stats.steps}</div>
              <div>vehiclesLeft</div>
              <div>{diag.stats.vehiclesLeft}</div>
              <div>avgWaitSteps</div>
              <div>{diag.stats.avgWaitSteps.toFixed(3)}</div>
              <div>maxWaitSteps</div>
              <div>{diag.stats.maxWaitSteps}</div>
              <div>avgQueueTotal</div>
              <div>{diag.stats.avgQueueTotal.toFixed(3)}</div>
              <div>maxQueueTotal</div>
              <div>{diag.stats.maxQueueTotal}</div>
            </div>
          ) : (
            <div className="small">Enable diagnostics to see stats and step-by-step trace.</div>
          )}
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="row">
            <b>Trace</b>
            <span className="small">Step-by-step (requires diagnostics)</span>
          </div>

          {diag ? (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Step</th>
                  <th style={{ width: 220 }}>Signal</th>
                  <th style={{ width: 220 }}>Left vehicles</th>
                  <th>Queue before</th>
                  <th>Queue after</th>
                </tr>
              </thead>
              <tbody>
                {diag.trace.map((t) => (
                  <tr key={t.stepIndex}>
                    <td>{t.stepIndex}</td>
                    <td>
                      <div>
                        <b>{t.signal.stageKind}</b>
                      </div>
                      <div className="small">
                        phase: {t.signal.activePhase ?? "-"}
                        <br />
                        next: {t.signal.nextPhase ?? "-"}
                        <br />
                        greenAge: {t.signal.greenAgeSteps}
                      </div>
                    </td>
                    <td>
                      {t.leftVehicles.length ? (
                        <pre>{JSON.stringify(t.leftVehicles, null, 2)}</pre>
                      ) : (
                        <span className="small">[]</span>
                      )}
                    </td>
                    <td>
                      <pre>{JSON.stringify(t.queueSizesBefore, null, 2)}</pre>
                    </td>
                    <td>
                      <pre>{JSON.stringify(t.queueSizesAfter, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="small">No trace available without diagnostics.</div>
          )}
        </div>
      </div>
    </div>
  );
}