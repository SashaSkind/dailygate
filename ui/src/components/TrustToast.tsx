import { useEffect } from "react";

export interface TrustChange {
  key: string;            // unique per event so re-fires re-animate
  category: string;
  kind: "promoted" | "demoted";
  fromLabel: string;
  toLabel: string;
}

const TIER_LABEL: Record<number, string> = {
  0: "L0 · Observer",
  1: "L1 · Reversible",
  2: "L2 · Routine",
};

export function tierLabel(level: number): string {
  return TIER_LABEL[level] ?? `L${level}`;
}

export function TrustToast({ change, onDone }: { change: TrustChange | null; onDone: () => void }) {
  useEffect(() => {
    if (!change) return;
    const id = setTimeout(onDone, 5200);
    return () => clearTimeout(id);
  }, [change, onDone]);

  if (!change) return null;
  const promoted = change.kind === "promoted";

  return (
    <div className={`trust-toast ${promoted ? "promoted" : "demoted"}`} key={change.key} role="status">
      <div className="trust-toast-icon">{promoted ? "🎉" : "⬇️"}</div>
      <div className="trust-toast-body">
        <div className="trust-toast-head">
          <span className="trust-toast-cat">{change.category}</span>
          {promoted ? " earned more autonomy" : " lost autonomy"}
        </div>
        <div className="trust-toast-arc">
          <span className="tt-from">{change.fromLabel}</span>
          <span className="tt-arrow">{promoted ? "→" : "→"}</span>
          <span className={`tt-to ${promoted ? "up" : "down"}`}>{change.toLabel}</span>
        </div>
        <div className="trust-toast-note">
          {promoted
            ? "The agent now acts on this on its own — because you trusted it enough."
            : "Back to asking first — one override resets earned trust."}
        </div>
      </div>
    </div>
  );
}
