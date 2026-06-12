import type { Trust, AutonomyLevel } from "../types";

const LEVEL: Record<AutonomyLevel, { label: string; cls: string; fillCls: string }> = {
  0: { label: "L0 · observer",   cls: "badge badge-neutral", fillCls: "score-fill score-fill-0" },
  1: { label: "L1 · reversible", cls: "badge badge-blue",    fillCls: "score-fill score-fill-1" },
  2: { label: "L2 · routine",    cls: "badge badge-green",   fillCls: "score-fill score-fill-2" },
};

export function TrustLadder({ trust }: { trust: Trust[] }) {
  const routine    = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;
  const reversible = trust.filter((t) => t.autonomy_level === 1).length;
  const capped     = trust.filter((t) => t.ceiling || t.autonomy_level === 0).length;

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

          return (
            <li key={t.category} className="trust-item">
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
            </li>
          );
        })}
        {trust.length === 0 && <li className="empty">No trust data yet.</li>}
      </ul>

      <p className="hint">
        Bar = Bayesian score. Tick = auto threshold (shifts with your team's override rate).
        L2 = acts alone. L1 = reversible writes only. L0 / ⛔ = always asks you first.
      </p>
    </div>
  );
}
