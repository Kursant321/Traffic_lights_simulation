import React, { useEffect, useMemo, useState } from "react";
import { IntersectionView } from "./IntersectionView";

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
  if (!("stats" in obj)) return false;
  if (typeof obj.stats !== "object" || obj.stats === null) return false;
  if (!("output" in obj)) return false;
  if (!("trace" in obj)) return false;
  return true;
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>("fixed");
  const [diagnostics, setDiagnostics] = useState<boolean>(true);
  const [realistic, setRealistic] = useState<boolean>(false);

  const [input, setInput] = useState<string>(SAMPLE);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [rawResponse, setRawResponse] = useState<string>("");

  // replay state
  const [selectedStep, setSelectedStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const parsed = useMemo(() => {
    try {
      return JSON.parse(rawResponse) as unknown;
    } catch {
      return null;
    }
  }, [rawResponse]);

  const diag = isDiagnostics(parsed) ? parsed : null;
  const out: SimOutput | null = diag ? diag.output : (parsed as SimOutput | null);

  const maxStep = diag ? Math.max(0, diag.trace.length - 1) : 0;
  const currentTrace = diag ? diag.trace[Math.min(selectedStep, maxStep)] : null;

  useEffect(() => {
    if (!isPlaying) return;
    if (!diag || diag.trace.length === 0) return;

    const t = setInterval(() => {
      setSelectedStep((s) => {
        const next = s + 1;
        if (next > maxStep) return 0;
        return next;
      });
    }, 700);

    return () => clearInterval(t);
  }, [isPlaying, diag, maxStep]);

  async function run(): Promise<void> {
    setError("");
    setLoading(true);
    setRawResponse("");
    setIsPlaying(false);
    setSelectedStep(0);

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

    if (realistic) {
      params.set("yellowSteps", "1");
      params.set("allRedSteps", "1");
    }

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

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 style={{ margin: 0 }}>Traffic Lights Simulation</h2>
          <div className="badge">
            Web UI → API (/simulate) • Output and diagnostics separated
          </div>
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

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={realistic}
              onChange={(e) => setRealistic(e.target.checked)}
            />
            realistic (yellow + all-red)
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
            <b>Output (required format)</b>
            <span className="small">{out ? "stepStatuses / leftVehicles" : "—"}</span>
          </div>
          <pre>
            {out ? JSON.stringify(out, null, 2) : "Run the simulation to see output."}
          </pre>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="row">
            <b>Replay</b>
            <span className="small">Requires diagnostics</span>
          </div>

          {diag && currentTrace ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  disabled={!diag || diag.trace.length === 0}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>

                <span className="small">
                  Step: {selectedStep} / {maxStep}
                </span>

                <input
                  type="range"
                  min={0}
                  max={maxStep}
                  value={selectedStep}
                  onChange={(e) => setSelectedStep(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                <IntersectionView
                  signal={currentTrace.signal}
                  queueSizes={currentTrace.queueSizesBefore}
                  width={520}
                  height={300}
                />

                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="kv">
                    <div>stageKind</div>
                    <div>{currentTrace.signal.stageKind}</div>
                    <div>activePhase</div>
                    <div>{currentTrace.signal.activePhase ?? "-"}</div>
                    <div>nextPhase</div>
                    <div>{currentTrace.signal.nextPhase ?? "-"}</div>
                    <div>greenAgeSteps</div>
                    <div>{currentTrace.signal.greenAgeSteps}</div>
                    <div>leftVehicles</div>
                    <div>
                      <pre style={{ margin: 0 }}>
                        {JSON.stringify(currentTrace.leftVehicles, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="small">Enable diagnostics and run the simulation to use replay.</div>
          )}
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
            <div className="small">Enable diagnostics to see stats and trace.</div>
          )}
        </div>

        <details className="card" style={{ gridColumn: "1 / -1" }}>
          <summary style={{ cursor: "pointer" }}>Advanced: raw API response</summary>
          <pre>{rawResponse || "—"}</pre>
        </details>
      </div>
    </div>
  );
}