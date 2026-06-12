import type { Trust, AutonomyLevel } from "../types";

// THE differentiator beat: how much autonomy the agent has earned, per category.
// Shows the earned tier (0 observer → 1 reversible → 2 routine) and the Bayesian
// trust score, plus the hard "ceiling" categories that are capped at observer.

const TIERS: Record<AutonomyLevel, { label: string; cls: string }> = {
  0: { label: "observer · escalates", cls: "pill-ask" },
  1: { label: "reversible writes", cls: "pill-mid" },
  2: { label: "acts on routine work", cls: "pill-auto" },
};

export function TrustDashboard({ trust }: { trust: Trust[] }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Earned trust</h2></div>
      <ul className="trust-list">
        {trust.map((t) => {
          const tier = TIERS[t.ceiling ? 0 : t.autonomy_level];
          return (
            <li key={t.category} className="trust-row">
              <span className="cat">{t.category}</span>
              {t.ceiling ? (
                <span className="pill pill-ceiling" title="Capped at level 0 — earned trust can never promote it">
                  always asks (ceiling)
                </span>
              ) : (
                <span className={`pill ${tier.cls}`} title={`autonomy level ${t.autonomy_level}`}>
                  L{t.autonomy_level} · {tier.label}
                </span>
              )}
              <span className="counts" title="Bayesian trust score">
                {(t.trust_score * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
        {trust.length === 0 && <li className="empty">No trust history yet.</li>}
      </ul>
      <p className="hint">Trust is a Bayesian score from the manager's past approvals; crossing a band promotes a category to the next permission tier. Overrides demote it. Ceiling categories are capped at observer.</p>
    </div>
  );
}
