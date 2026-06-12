import { useEffect, useState } from "react";
import type { TrustEvent, TrustEventType } from "../types";
import { getTrustEvents } from "../api";

const EVENT_META: Record<TrustEventType, { icon: string; label: string }> = {
  promoted:           { icon: "↑", label: "Promoted" },
  demoted:            { icon: "↓", label: "Demoted" },
  score_updated:      { icon: "→", label: "Score shift" },
  created:            { icon: "◎", label: "Bootstrapped" },
  threshold_adjusted: { icon: "◈", label: "Threshold tuned" },
};

function timeAgo(ts: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function shortReason(reason: string): string {
  return reason.length > 90 ? reason.slice(0, 90) + "…" : reason;
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
        <span className="card-title">Learning log</span>
        <span className="pill pill-num">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <p className="empty">No trust events yet.</p>
      ) : (
        <ul className="event-list scroll-list">
          {events.map((e) => {
            const meta = EVENT_META[e.event_type] ?? { icon: "·", label: e.event_type };
            const deltaDir = e.old_score !== null
              ? e.new_score > e.old_score ? "+" : e.new_score < e.old_score ? "-" : "="
              : "";
            const deltaVal = e.old_score !== null
              ? `${deltaDir}${Math.abs((e.new_score - e.old_score) * 100).toFixed(1)}%`
              : `${(e.new_score * 100).toFixed(0)}%`;

            return (
              <li key={e.id}>
                <div className={`event-card ${e.event_type}`}>
                  <span className="event-icon">{meta.icon}</span>
                  <div className="event-body">
                    <span className="event-category">{e.category}</span>
                    <span className="event-desc">{shortReason(e.reason)}</span>
                    <span className="event-delta">
                      {e.old_score !== null
                        ? `${(e.old_score * 100).toFixed(0)}% → ${(e.new_score * 100).toFixed(0)}%`
                        : `score ${(e.new_score * 100).toFixed(0)}%`}
                      {" · "}conf {(e.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <time className="event-time">{timeAgo(e.timestamp)}</time>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        Real-time log of Bayesian trust shifts — every promotion, demotion, and score update with the exact reason.
      </p>
    </div>
  );
}
