// The self-improvement loop — 4-node visual showing how the Bayesian engine learns.
export function LoopDiagram() {
  const nodes = [
    { icon: "📥", color: "blue",   label: "Work arrives",        sub: "GitHub issue, email, or Slack message" },
    { icon: "🔐", color: "amber",  label: "Trust gate",          sub: "Bayesian score vs dynamic threshold" },
    { icon: "⚡", color: "green",  label: "Agent acts",          sub: "L2 ROUTINE closes, assigns, emails" },
    { icon: "📈", color: "violet", label: "Score improves",      sub: "Approval → posterior shifts → more autonomy" },
  ];

  return (
    <div className="loop-diagram">
      <div className="loop-header">
        <h2>How the agent learns</h2>
        <span className="loop-header-sub">
          Every manager approval moves the Bayesian score — over time the agent earns more autonomy
        </span>
      </div>

      <div className="loop-flow">
        {nodes.map((n, i) => (
          <div key={n.label} style={{ display: "flex", alignItems: "center", flex: i < nodes.length - 1 ? "1" : undefined }}>
            <div className="loop-node">
              <div className={`loop-icon ${n.color}`}>{n.icon}</div>
              <div className="loop-node-label">{n.label}</div>
              <div className="loop-node-sub">{n.sub}</div>
            </div>
            {i < nodes.length - 1 && (
              <div className="loop-arrow">→</div>
            )}
          </div>
        ))}

        <div className="loop-feedback">
          ↩ Every approval raises the score · overrides lower it · score vs threshold = promotion or demotion
        </div>
      </div>
    </div>
  );
}
