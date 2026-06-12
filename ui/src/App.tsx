import { useEffect, useState } from "react";
import type { ContextSnapshot } from "./types";
import { getContext, getHealth } from "./api";
import { EscalationQueue } from "./components/EscalationQueue";
import { AutonomyFeed } from "./components/AutonomyFeed";
import { TrustDashboard } from "./components/TrustDashboard";
import { TrustEventStream } from "./components/TrustEventStream";
import { WorkItemList } from "./components/WorkItemList";
import "./styles.css";

export default function App() {
  const [ctx, setCtx]           = useState<ContextSnapshot | null>(null);
  const [langfuse, setLangfuse] = useState<string | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      getContext().then(setCtx).catch((e) => setErr(String(e)));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getHealth()
      .then((h) => setLangfuse(h.langfuse))
      .catch(() => setLangfuse(null));
  }, []);

  const trust       = ctx?.trust ?? [];
  const routineN    = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;
  const reversibleN = trust.filter((t) => t.autonomy_level === 1).length;
  const workOpen    = (ctx?.work_items ?? []).filter((i) => i.status !== "done").length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="live-dot" />
          <div>
            <h1>DailyGate</h1>
            <div className="topbar-tagline">Earned autonomy · Bayesian trust engine</div>
          </div>
        </div>

        <div className="topbar-stats">
          {routineN > 0 && (
            <div className="stat-chip emerald">
              <span className="stat-chip-val">{routineN}</span>
              categories routine
            </div>
          )}
          {reversibleN > 0 && (
            <div className="stat-chip sky">
              <span className="stat-chip-val">{reversibleN}</span>
              reversible
            </div>
          )}
          <div className="stat-chip indigo">
            <span className="stat-chip-val">{workOpen}</span>
            items open
          </div>
          {langfuse === "connected" && (
            <div className="stat-chip emerald">◉ Langfuse live</div>
          )}
        </div>
      </header>

      {err && (
        <div className="error-banner">
          API unreachable — is <code>data/api/start.sh</code> running on :8001?
        </div>
      )}

      <div className="main-grid">
        <div className="col-left">
          <EscalationQueue />
          <AutonomyFeed />
          <WorkItemList items={ctx?.work_items ?? []} workload={ctx?.workload ?? []} />
        </div>

        <div className="col-center">
          <TrustDashboard trust={trust} />
        </div>

        <div className="col-right">
          <TrustEventStream />
        </div>
      </div>
    </div>
  );
}
