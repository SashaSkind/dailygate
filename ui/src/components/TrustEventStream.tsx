import { useEffect, useState } from "react";
import type { TrustEvent, TrustEventType } from "../types";
import { getTrustEvents } from "../api";

const META: Record<TrustEventType, { icon: string; label: string }> = {
  promoted:           { icon: "↑", label: "Promoted" },
  demoted:            { icon: "↓", label: "Demoted" },
  score_updated:      { icon: "→", label: "Score shift" },
  created:            { icon: "◎", label: "New category" },
  threshold_adjusted: { icon: "◈", label: "Threshold tuned" },
};

function timeAgo(ts: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TrustEventStream() {
  const [events, setEvents] = useState<TrustEvent[]>([]);
  useEffect(() => {
    const tick = () => getTrustEvents(20).then(setEvents).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">How it's improving</div>
          <div className="card-sub">Every score shift logged with reasoning</div>
        </div>
        <span className="badge badge-violet">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <p className="empty">No trust events yet.</p>
      ) : (
        <ul className="event-list scroll-list">
          {events.map((e) => {
            const meta = META[e.event_type] ?? { icon: "·", label: e.event_type };
            return (
              <li key={e.id}>
                <div className={`event-card ${e.event_type}`}>
                  <span className="event-icon">{meta.icon}</span>
                  <div className="event-body">
                    <span className="event-cat">{e.category}</span>
                    <span className="event-desc">{e.reason}</span>
                    {e.old_score !== null && (
                      <span className="event-delta">
                        {(e.old_score * 100).toFixed(0)}% → {(e.new_score * 100).toFixed(0)}%
                        {" · "}conf {(e.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <time className="event-time">{timeAgo(e.timestamp)}</time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
