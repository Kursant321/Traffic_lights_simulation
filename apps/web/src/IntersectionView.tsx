import React from "react";

type Signal = {
  stageKind: "GREEN" | "YELLOW" | "ALL_RED";
  activePhase: string | null;
  nextPhase: string | null;
};

type QueueSizes = Record<string, Record<string, number>>;

export function IntersectionView(props: {
  signal: Signal;
  queueSizes: QueueSizes;
  width?: number;
  height?: number;
}): JSX.Element {
  const w = props.width ?? 520;
  const h = props.height ?? 300;

  const phase = props.signal.activePhase;
  const next = props.signal.nextPhase;
  const stage = props.signal.stageKind;

  const isNS = (p: string | null) => (p ? p.startsWith("NS_") : false);
  const isEW = (p: string | null) => (p ? p.startsWith("EW_") : false);

  type LightColor = "red" | "yellow" | "green";

  const nsColor: LightColor = (() => {
    if (stage === "ALL_RED") return "red";
    if (stage === "YELLOW") return isNS(next) ? "yellow" : "red";
    if (stage === "GREEN") return isNS(phase) ? "green" : "red";
    return "red";
  })();

  const ewColor: LightColor = (() => {
    if (stage === "ALL_RED") return "red";
    if (stage === "YELLOW") return isEW(next) ? "yellow" : "red";
    if (stage === "GREEN") return isEW(phase) ? "green" : "red";
    return "red";
  })();

  const colorHex = (c: LightColor) => {
    if (c === "green") return "#22c55e";
    if (c === "yellow") return "#f59e0b";
    return "#ef4444";
  };

  const q = props.queueSizes;

  const get = (road: string, lane: string) => {
    const rr = q[road];
    if (!rr) return 0;
    const v = rr[lane];
    return typeof v === "number" ? v : 0;
  };

  const label = `${stage}${stage === "GREEN" ? ` (${phase ?? "-"})` : ` (next: ${next ?? "-"})`}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* background */}
      <rect x="0" y="0" width={w} height={h} rx="12" fill="#0f172a" />
      <rect x="12" y="12" width={w - 24} height={h - 24} rx="10" fill="#111827" />

      {/* roads */}
      <rect x={w * 0.45} y="20" width={w * 0.1} height={h - 40} fill="#1f2937" />
      <rect x="20" y={h * 0.45} width={w - 40} height={h * 0.1} fill="#1f2937" />

      {/* center box */}
      <rect
        x={w * 0.44}
        y={h * 0.44}
        width={w * 0.12}
        height={h * 0.12}
        fill="#0b1222"
        stroke="#2b3a57"
      />

      {/* signals */}
      <circle
        cx={w * 0.5}
        cy={h * 0.12}
        r="10"
        fill={colorHex(nsColor)}
        stroke="#0b0f17"
      />
      <circle
        cx={w * 0.5}
        cy={h * 0.88}
        r="10"
        fill={colorHex(nsColor)}
        stroke="#0b0f17"
      />
      <circle
        cx={w * 0.12}
        cy={h * 0.5}
        r="10"
        fill={colorHex(ewColor)}
        stroke="#0b0f17"
      />
      <circle
        cx={w * 0.88}
        cy={h * 0.5}
        r="10"
        fill={colorHex(ewColor)}
        stroke="#0b0f17"
      />

      {/* labels */}
      <text x={w * 0.5} y={h * 0.08} textAnchor="middle" fill="#e7eefc" fontSize="12">
        N
      </text>
      <text x={w * 0.5} y={h * 0.96} textAnchor="middle" fill="#e7eefc" fontSize="12">
        S
      </text>
      <text x={w * 0.08} y={h * 0.5} textAnchor="middle" fill="#e7eefc" fontSize="12">
        W
      </text>
      <text x={w * 0.92} y={h * 0.5} textAnchor="middle" fill="#e7eefc" fontSize="12">
        E
      </text>

      {/* queue numbers */}
      <text x={w * 0.62} y={h * 0.2} fill="#cbd5e1" fontSize="11">
        N: L {get("north", "left")} / T {get("north", "through")} / R{" "}
        {get("north", "right")}
      </text>
      <text x={w * 0.62} y={h * 0.8} fill="#cbd5e1" fontSize="11">
        S: L {get("south", "left")} / T {get("south", "through")} / R{" "}
        {get("south", "right")}
      </text>
      <text x={w * 0.2} y={h * 0.38} fill="#cbd5e1" fontSize="11">
        W: L {get("west", "left")} / T {get("west", "through")} / R {get("west", "right")}
      </text>
      <text x={w * 0.2} y={h * 0.62} fill="#cbd5e1" fontSize="11">
        E: L {get("east", "left")} / T {get("east", "through")} / R {get("east", "right")}
      </text>

      <text x="24" y={h - 24} fill="#94a3b8" fontSize="12">
        {label}
      </text>
    </svg>
  );
}
