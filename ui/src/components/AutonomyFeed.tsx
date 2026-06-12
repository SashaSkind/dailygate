import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getAutonomyFeed } from "../api";

function timeAgo(ts: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

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
        <div>
          <div className="card-title">Acted autonomously</div>
          <div className="card-sub">No manager needed for these</div>
        </div>
        <span className="badge badge-green">{items.length} total</span>
      </div>

      {items.length === 0 ? (
        <p className="empty">No autonomous actions yet.</p>
      ) : (
        <ul className="feed-list scroll-list">
          {items.map((d) => (
            <li key={d.id} className="feed-item">
              <div className="feed-dot" />
              <div className="feed-body">
                <div className="feed-action">{d.action}</div>
                <div className="feed-meta">
                  <span className="cat-badge">{d.category}</span>
                  <span className="feed-time">{timeAgo(d.timestamp)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
