import { useEffect, useState } from "react";
import type { Decision } from "../types";
import { getAutonomyFeed } from "../api";

function timeAgo(ts: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
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
        <span className="card-title">Acted autonomously</span>
        <span className="pill pill-l2">{items.length} total</span>
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
