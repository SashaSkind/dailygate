import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getAutonomyFeed } from "../api";

// "It handled N things on its own today." — the live feed of autonomous actions.
export function AutonomyFeed() {
  const [items, setItems] = useState<Decision[]>([]);
  useEffect(() => {
    const tick = () => getAutonomyFeed().then(setItems).catch(() => {});
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Autonomy feed</h2>
        <span className="pill pill-auto">{items.length} acted on its own</span>
      </div>
      <ul className="feed">
        {items.map((d) => (
          <li key={d.id} className="feed-row">
            <span className="cat">{d.category}</span>
            <span className="action">{d.action}</span>
            <time>{new Date(d.timestamp).toLocaleTimeString()}</time>
          </li>
        ))}
        {items.length === 0 && <li className="empty">No autonomous actions yet.</li>}
      </ul>
    </div>
  );
}
