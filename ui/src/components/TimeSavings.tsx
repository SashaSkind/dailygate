import type { DashboardStats, Trust } from "../types";

const TIME_PER_CATEGORY: Record<string, number> = {
  "issue-triage": 8,
  "capacity-assignment": 15,
  "nudge": 5,
  "thank-you-note": 10,
  "code-review": 20,
  "candidate-decision": 0,
};

export function TimeSavings({ stats, trust }: { stats: DashboardStats | null; trust: Trust[] }) {
  if (!stats) return null;

  const totalMins = stats.time_saved_min;
  const hours = (totalMins / 60).toFixed(1);

  const breakdown = trust
    .filter((t) => !t.ceiling && t.autonomy_level >= 1)
    .map((t) => ({
      category: t.category,
      minsPerTask: TIME_PER_CATEGORY[t.category] ?? 5,
      tasks: t.approvals_count,
      saved: (TIME_PER_CATEGORY[t.category] ?? 5) * t.approvals_count,
    }))
    .sort((a, b) => b.saved - a.saved);

  const maxSaved = Math.max(...breakdown.map((b) => b.saved), 1);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Time saved by the agent</div>
          <div className="card-sub">{stats.total_autonomous} autonomous decisions so far</div>
        </div>
        <span className="badge badge-green">
          {stats.promotions} promotions earned
        </span>
      </div>

      <div className="savings-hero">
        <span className="savings-hours">{hours}</span>
        <span className="savings-unit">hours saved</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        vs. manager handling each item manually (~{Math.round(totalMins / Math.max(stats.total_autonomous, 1))} min avg per task)
      </div>

      {breakdown.length > 0 && (
        <ul className="savings-breakdown">
          {breakdown.map((b) => (
            <li key={b.category} className="savings-row">
              <span className="savings-cat">{b.category}</span>
              <div className="savings-bar-track">
                <div className="savings-bar-fill" style={{ width: `${(b.saved / maxSaved) * 100}%` }} />
              </div>
              <span className="savings-mins">{b.saved} min</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
