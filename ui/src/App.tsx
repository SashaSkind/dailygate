import { useEffect, useState, useCallback } from "react";
import type { ContextSnapshot, DashboardStats } from "./types";
import { getContext, getStats } from "./api";
import { LoopDiagram } from "./components/LoopDiagram";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { TrustLadder } from "./components/TrustLadder";
import { TrustEventStream } from "./components/TrustEventStream";
import { TimeSavings } from "./components/TimeSavings";
import { EscalationQueue } from "./components/EscalationQueue";
import { AutonomyFeed } from "./components/AutonomyFeed";
import "./styles.css";

export default function App() {
  const [ctx, setCtx]       = useState<ContextSnapshot | null>(null);
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [err, setErr]       = useState<string | null>(null);

  const reload = useCallback(() => {
    getContext().then(setCtx).catch((e) => setErr(String(e)));
    getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);

  const trust = ctx?.trust ?? [];
  const hours = stats ? (stats.time_saved_min / 60).toFixed(1) : "—";
  const routineCount = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="live-ring" />
          <div>
            <div className="brand-name">DailyGate</div>
            <div className="brand-tagline">Your AI chief-of-staff · earns trust over time</div>
          </div>
        </div>
        <div className="topbar-stats">
          <div className="stat-pill green">
            <span className="stat-pill-val">{hours}</span>
            hrs saved
          </div>
          <div className="stat-pill green">
            <span className="stat-pill-val">{stats?.total_autonomous ?? "—"}</span>
            acted alone
          </div>
          <div className="stat-pill blue">
            <span className="stat-pill-val">{routineCount}</span>
            categories trusted
          </div>
          {stats && stats.escalation_count > 0 && (
            <div className="stat-pill amber">
              <span className="stat-pill-val">{stats.escalation_count}</span>
              need you
            </div>
          )}
        </div>
      </header>

      {err && <div className="error-banner">API unreachable — run <code>data/api/start.sh</code> on :8001</div>}

      <LoopDiagram />

      <div className="main-grid">
        <div>
          <ExecutionPanel onComplete={reload} />
          <EscalationQueue />
          <AutonomyFeed />
        </div>
        <div>
          <TrustLadder trust={trust} />
          <TimeSavings stats={stats} trust={trust} />
          <TrustEventStream />
        </div>
      </div>
    </div>
  );
}
