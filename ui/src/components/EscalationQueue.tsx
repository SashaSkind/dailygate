import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getEscalationQueue, resolveEscalation } from "../api";

// The few things the agent is ASKING about — high-stakes / ceiling decisions.
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
    <div className="card card-escalate">
      <div className="card-head">
        <h2>Needs your decision</h2>
        <span className="pill pill-ask">{items.length} escalated</span>
      </div>
      <ul className="feed">
        {items.map((d) => (
          <li key={d.id} className="escalate-row">
            <div>
              <span className="cat cat-high">{d.category}</span>
              <span className="action">{d.action}</span>
              {!d.reversible && <span className="tag tag-irrev">irreversible</span>}
            </div>
            <div className="actions">
              <button className="btn btn-approve" onClick={() => resolve(d, "approved")}>Approve</button>
              <button className="btn btn-reject" onClick={() => resolve(d, "overridden")}>Override</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="empty">Nothing needs you right now. 🎉</li>}
      </ul>
    </div>
  );
}
