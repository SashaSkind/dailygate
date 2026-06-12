import type { Trust } from "../types";

// THE differentiator beat: how much autonomy the agent has earned, per category.
// Shows earned "auto" vs. the hard "ceiling" categories that always escalate.
export function TrustDashboard({ trust }: { trust: Trust[] }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Earned trust</h2></div>
      <ul className="trust-list">
        {trust.map((t) => (
          <li key={t.category} className="trust-row">
            <span className="cat">{t.category}</span>
            {t.ceiling ? (
              <span className="pill pill-ceiling" title="Always escalates — trust can never override this">
                always asks
              </span>
            ) : (
              <span className={`pill ${t.trust_level === "auto" ? "pill-auto" : "pill-ask"}`}>
                {t.trust_level === "auto" ? "acts alone" : "asks first"}
              </span>
            )}
            <span className="counts" title="approvals / overrides">
              ✓{t.approvals_count} ✗{t.overrides_count}
            </span>
          </li>
        ))}
        {trust.length === 0 && <li className="empty">No trust history yet.</li>}
      </ul>
      <p className="hint">3 consecutive approvals promote a category to “acts alone.” An override drops it back to “asks first.”</p>
    </div>
  );
}
