import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getEscalationQueue, resolveEscalation } from "../api";

export function EscalationQueue() {
  const [items, setItems] = useState<Decision[]>([]);
  const load = () => getEscalationQueue().then(setItems).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const resolve = async (d: Decision, r: "approved" | "overridden") => {
    await resolveEscalation(d, r);
    load();
  };

  return (
    <div className={`card${items.length > 0 ? " card-escalate" : ""}`}>
      <div className="card-head">
        <span className="card-title">Needs your decision</span>
        <span className={`pill ${items.length > 0 ? "pill-ask" : "pill-num"}`}>
          {items.length} escalated
        </span>
      </div>

      {items.length === 0 ? (
        <p className="empty">Nothing needs you right now — agent is handling it.</p>
      ) : (
        <ul className="escalate-list">
          {items.map((d) => (
            <li key={d.id} className="escalate-item">
              <div className="escalate-meta">
                <span className={`cat-badge${d.stakes === "high" ? " high-stakes" : ""}`}>
                  {d.category}
                </span>
                {!d.reversible && <span className="tag tag-irrev">irreversible</span>}
                {d.stakes === "high" && <span className="tag tag-irrev">high stakes</span>}
              </div>
              <p className="escalate-action">{d.action}</p>
              <div className="escalate-btns">
                <button className="btn btn-approve" onClick={() => resolve(d, "approved")}>
                  Approve
                </button>
                <button className="btn btn-override" onClick={() => resolve(d, "overridden")}>
                  Override
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
