import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getEscalationQueue, resolveEscalation } from "../api";

export function EscalationQueue({ onResolve }: { onResolve?: () => void }) {
  const [items, setItems] = useState<Decision[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => getEscalationQueue().then(setItems).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const resolve = async (d: Decision, r: "approved" | "overridden") => {
    setBusy(d.id);
    try {
      await resolveEscalation(d, r);
      load();
      onResolve?.();   // refresh the whole dashboard so trust + ladder update instantly
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Needs your decision</div>
          <div className="card-sub">High-stakes or ceiling items the agent always escalates</div>
        </div>
        <span className={`badge ${items.length > 0 ? "badge-amber" : "badge-neutral"}`}>
          {items.length} waiting
        </span>
      </div>

      {items.length === 0 ? (
        <p className="empty">Nothing needs you right now — agent has it covered.</p>
      ) : (
        <ul className="escalate-list">
          {items.map((d) => (
            <li key={d.id} className="escalate-item">
              <div className="escalate-meta">
                <span className={`cat-badge${d.stakes === "high" ? " high" : ""}`}>{d.category}</span>
                {!d.reversible && <span className="tag tag-irrev">irreversible</span>}
                {d.stakes === "high" && <span className="tag tag-irrev">high stakes</span>}
              </div>
              <p className="escalate-action">{d.action}</p>
              <div className="escalate-btns">
                <button className="btn btn-green" disabled={busy === d.id} onClick={() => resolve(d, "approved")}>Approve</button>
                <button className="btn btn-red"   disabled={busy === d.id} onClick={() => resolve(d, "overridden")}>Override</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
