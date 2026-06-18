import { useEffect, useRef, useState } from "react";
import type { Trust, AutonomyLevel } from "../types";
import { teach } from "../api";

const LEVEL: Record<AutonomyLevel, { label: string; cls: string; fillCls: string }> = {
  0: { label: "L0 · observer",   cls: "badge badge-neutral", fillCls: "score-fill score-fill-0" },
  1: { label: "L1 · reversible", cls: "badge badge-blue",    fillCls: "score-fill score-fill-1" },
  2: { label: "L2 · routine",    cls: "badge badge-green",   fillCls: "score-fill score-fill-2" },
};

const effLevel = (t: Trust) => (t.ceiling ? 0 : t.autonomy_level);

export function TrustLadder({ trust, onTeach }: { trust: Trust[]; onTeach?: () => void }) {
  const routine    = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;
  const reversible = trust.filter((t) => t.autonomy_level === 1).length;
  const capped     = trust.filter((t) => t.ceiling || t.autonomy_level === 0).length;

  // Flash a row green/red for a moment when its tier changes.
  const prevLevels = useRef<Map<string, number>>(new Map());
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const next = new Map(trust.map((t) => [t.category, effLevel(t)]));
    const fresh: Record<string, "up" | "down"> = {};
    if (prevLevels.current.size) {
      for (const t of trust) {
        const from = prevLevels.current.get(t.category);
        const to = effLevel(t);
        if (from !== undefined && from !== to) fresh[t.category] = to > from ? "up" : "down";
      }
    }
    prevLevels.current = next;
    if (Object.keys(fresh).length) {
      setFlash(fresh);
      const id = setTimeout(() => setFlash({}), 1600);
      return () => clearTimeout(id);
    }
  }, [trust]);

  const doTeach = async (cat: string, kind: "approved" | "overridden") => {
    setBusy(cat);
    try {
      await teach(cat, kind);
      onTeach?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">How much does the agent know?</div>
          <div className="card-sub">Bayesian trust per category — score vs threshold decides the tier</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {routine    > 0 && <span className="badge badge-green">{routine} L2</span>}
          {reversible > 0 && <span className="badge badge-blue">{reversible} L1</span>}
          {capped     > 0 && <span className="badge badge-neutral">{capped} L0</span>}
        </div>
      </div>

      <ul className="trust-list">
        {trust.map((t) => {
          const level  = t.ceiling ? 0 : t.autonomy_level;
          const meta   = LEVEL[level];
          const score  = t.trust_score  ?? 0;
          const conf   = t.trust_confidence ?? 0;
          const thresh = t.auto_threshold ?? 0.8;
          const f      = flash[t.category];

          return (
            <li key={t.category} className={`trust-item${f ? ` flash-${f}` : ""}`}>
              <div className="trust-row-top">
                <span className="category-name">{t.category}</span>
                {t.ceiling
                  ? <span className="badge badge-red">always escalates ⛔</span>
                  : <span className={meta.cls}>{meta.label}</span>}
                <span className="score-num">{(score * 100).toFixed(0)}%</span>
              </div>

              <div className="score-track">
                <div className={meta.fillCls} style={{ width: `${score * 100}%` }} />
                {!t.ceiling && (
                  <div className="threshold-tick" style={{ left: `${thresh * 100}%` }}
                    title={`threshold: ${(thresh * 100).toFixed(0)}%`} />
                )}
              </div>

              <div className="trust-row-bottom">
                <div className="conf-wrap">
                  <span>conf</span>
                  <div className="conf-track">
                    <div className="conf-fill" style={{ width: `${conf * 100}%` }} />
                  </div>
                  <span>{(conf * 100).toFixed(0)}%</span>
                </div>
                <span className="approval-stat">
                  <span className="ap-y">{t.approvals_count}✓</span>{" "}
                  <span className="ap-n">{t.overrides_count}✗</span>
                </span>
              </div>

              {!t.ceiling && (
                <div className="teach-row">
                  <span className="teach-label">teach:</span>
                  <button className="teach-btn approve" disabled={busy === t.category}
                    title="Record a manager approval — watch trust climb"
                    onClick={() => doTeach(t.category, "approved")}>+ approve</button>
                  <button className="teach-btn override" disabled={busy === t.category}
                    title="Record an override — resets earned trust"
                    onClick={() => doTeach(t.category, "overridden")}>− override</button>
                </div>
              )}
            </li>
          );
        })}
        {trust.length === 0 && <li className="empty">No trust data yet — this org starts fully gated. Earn it.</li>}
      </ul>

      <p className="hint">
        Bar = Bayesian score. Tick = auto threshold (shifts with your team's override rate).
        L2 = acts alone. L1 = reversible writes only. L0 / ⛔ = always asks you first.
        Use <b>teach</b> to feed the model approvals/overrides and watch a category earn — or lose — autonomy.
      </p>
    </div>
  );
}
