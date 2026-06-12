import { useEffect, useState } from "react";
import type { ContextSnapshot } from "./types";
import { getContext } from "./api";
import { AutonomyFeed } from "./components/AutonomyFeed";
import { EscalationQueue } from "./components/EscalationQueue";
import { TrustDashboard } from "./components/TrustDashboard";
import { WorkItemList } from "./components/WorkItemList";

// Manager console. Three supervision panels + a GitHub-like work list.
// Poll every few seconds so autonomous actions appear "live" in the demo.
export default function App() {
  const [ctx, setCtx] = useState<ContextSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => getContext().then(setCtx).catch((e) => setErr(String(e)));
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>DailyGate <span className="muted">— Manager Console</span></h1>
        <p className="tagline">Autonomy is the default. The agent earns trust over time.</p>
      </header>

      {err && <div className="banner error">API not reachable: {err} — is Person B's server up?</div>}

      <main className="grid">
        <section className="col-main">
          <EscalationQueue />
          <AutonomyFeed />
        </section>
        <aside className="col-side">
          <TrustDashboard trust={ctx?.trust ?? []} />
          <WorkItemList items={ctx?.work_items ?? []} workload={ctx?.workload ?? []} />
        </aside>
      </main>
    </div>
  );
}
