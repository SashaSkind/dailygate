import type { Trust, AutonomyLevel } from "../types";

const LEVEL_META: Record<AutonomyLevel, { label: string; pillCls: string; fillCls: string }> = {
  0: { label: "OBSERVER",   pillCls: "pill pill-l0", fillCls: "score-fill score-fill-l0" },
  1: { label: "REVERSIBLE", pillCls: "pill pill-l1", fillCls: "score-fill score-fill-l1" },
  2: { label: "ROUTINE",    pillCls: "pill pill-l2", fillCls: "score-fill score-fill-l2" },
};

function ScoreBar({ score, threshold, level, ceiling }: {
  score: number; threshold: number; level: AutonomyLevel; ceiling: boolean;
}) {
  const fillPct  = Math.min(score * 100, 100);
  const threshPct = Math.min(threshold * 100, 100);
  const fillCls  = ceiling ? "score-fill score-fill-ceil" : LEVEL_META[level].fillCls;

  return (
    <div className="score-track">
      <div className={fillCls} style={{ width: `${fillPct}%` }} />
      {!ceiling && (
        <div className="threshold-marker"
          style={{ left: `${threshPct}%` }}
          title={`threshold: ${threshold * 100}%`} />
      )}
    </div>
  );
}

export function TrustDashboard({ trust }: { trust: Trust[] }) {
  const routine    = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;
  const reversible = trust.filter((t) => t.autonomy_level === 1).length;
  const capped     = trust.filter((t) => t.ceiling || t.autonomy_level === 0).length;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Trust Engine · Bayesian</span>
        <div style={{ display: "flex", gap: 4 }}>
          {routine    > 0 && <span className="pill pill-l2">{routine} L2</span>}
          {reversible > 0 && <span className="pill pill-l1">{reversible} L1</span>}
          {capped     > 0 && <span className="pill pill-l0">{capped} L0</span>}
        </div>
      </div>

      <ul className="trust-list">
        {trust.map((t) => {
          const level  = t.ceiling ? 0 : t.autonomy_level;
          const meta   = LEVEL_META[level];
          const score  = t.trust_score  ?? 0;
          const conf   = t.trust_confidence ?? 0;
          const thresh = t.auto_threshold   ?? 0.8;

          return (
            <li key={t.category} className="trust-item">
              <div className="trust-row-header">
                <span className="category-name">{t.category}</span>
                {t.ceiling
                  ? <span className="pill pill-ceil">CEILING</span>
                  : <span className={meta.pillCls}>L{t.autonomy_level} {meta.label}</span>}
                <span className="score-pct">{(score * 100).toFixed(0)}%</span>
              </div>

              <ScoreBar score={score} threshold={thresh} level={level} ceiling={t.ceiling} />

              <div className="trust-row-footer">
                <div className="conf-bar-wrap">
                  <span className="conf-label">conf</span>
                  <div className="conf-track">
                    <div className="conf-fill" style={{ width: `${conf * 100}%` }} />
                  </div>
                  <span className="conf-label">{(conf * 100).toFixed(0)}%</span>
                </div>
                <span className="approval-counts">
                  <span className="count-approve">{t.approvals_count}✓</span>{" "}
                  <span className="count-override">{t.overrides_count}✗</span>
                </span>
              </div>
            </li>
          );
        })}
        {trust.length === 0 && <li className="empty">Loading trust data…</li>}
      </ul>

      <p className="hint">
        Bar = Bayesian score. Marker = auto-threshold (shifts with team culture).
        Override → instant demotion. Cross threshold with confidence → promotion.
      </p>
    </div>
  );
}
