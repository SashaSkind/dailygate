import { useEffect, useState, useCallback, useRef } from "react";
import type { ContextSnapshot, DashboardStats, Trust } from "./types";
import { getContext, getStats, whoami, hasTrustKey } from "./api";
import { LoopDiagram } from "./components/LoopDiagram";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { TrustLadder } from "./components/TrustLadder";
import { TrustEventStream } from "./components/TrustEventStream";
import { TimeSavings } from "./components/TimeSavings";
import { EscalationQueue } from "./components/EscalationQueue";
import { AutonomyFeed } from "./components/AutonomyFeed";
import { WorkItemList } from "./components/WorkItemList";
import { TrustToast, tierLabel, type TrustChange } from "./components/TrustToast";
import { Onboarding } from "./components/Onboarding";
import "./styles.css";

// Effective tier a category is operating at (ceiling forces 0).
const effLevel = (t: Trust) => (t.ceiling ? 0 : t.autonomy_level);

export default function App() {
  const [ctx, setCtx]       = useState<ContextSnapshot | null>(null);
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [tenant, setTenant] = useState<string | null>(null);
  const [toast, setToast]   = useState<TrustChange | null>(null);
  const [onboard, setOnboard] = useState<boolean>(!hasTrustKey());

  // Remember each category's tier so we can detect promotions/demotions between snapshots.
  const prevLevels = useRef<Map<string, number> | null>(null);

  const onTrust = useCallback((snap: ContextSnapshot) => {
    setCtx(snap);
    const next = new Map(snap.trust.map((t) => [t.category, effLevel(t)]));
    const prev = prevLevels.current;
    if (prev) {
      // Surface the single most notable change: promotions first, then demotions.
      let best: TrustChange | null = null;
      for (const t of snap.trust) {
        const from = prev.get(t.category);
        const to = effLevel(t);
        if (from === undefined || from === to) continue;
        const kind = to > from ? "promoted" : "demoted";
        const cand: TrustChange = {
          key: `${t.category}-${from}-${to}-${Date.now()}`,
          category: t.category, kind,
          fromLabel: tierLabel(from), toLabel: tierLabel(to),
        };
        if (!best || (kind === "promoted" && best.kind !== "promoted")) best = cand;
      }
      if (best) setToast(best);
    }
    prevLevels.current = next;
  }, []);

  const reload = useCallback(() => {
    setErr(null);
    getContext().then(onTrust).catch((e) => setErr(String(e)));
    getStats().then(setStats).catch(() => {});
    whoami().then((r) => setTenant(r.tenant)).catch(() => setTenant(null));
  }, [onTrust]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);

  // When switching orgs, forget the prior org's tiers so we don't fire a false toast.
  const resetTrustBaseline = useCallback(() => { prevLevels.current = null; }, []);

  // Called by the onboarding modal once a workspace is chosen (demo, new, or existing).
  const enterWorkspace = useCallback((_key: string) => {
    setCtx(null);
    setStats(null);
    resetTrustBaseline();
    setToast(null);
    setOnboard(false);
    reload();
  }, [reload, resetTrustBaseline]);

  const trust = ctx?.trust ?? [];
  const hours = stats ? (stats.time_saved_min / 60).toFixed(1) : "—";
  const routineCount = trust.filter((t) => t.autonomy_level === 2 && !t.ceiling).length;

  return (
    <div className="app">
      {onboard && (
        <Onboarding
          onEnter={enterWorkspace}
          onDismiss={hasTrustKey() ? () => setOnboard(false) : undefined}
        />
      )}
      <TrustToast change={toast} onDone={() => setToast(null)} />
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
          <button className="org-pill" onClick={() => setOnboard(true)} title="Switch workspace">
            <span className="org-dot" />
            {tenant ? `org: ${tenant}` : "set org key"}
          </button>
        </div>
      </header>

      {err && (
        <div className="error-banner">
          {err.includes("401")
            ? <>Unauthorized — wrong or missing org key. Click <b>“set org key”</b> (use <code>demo-key</code>).</>
            : <>API unreachable — run <code>data/api/start.sh</code> on :8001</>}
        </div>
      )}

      <LoopDiagram />

      <div className="main-grid">
        <div>
          <ExecutionPanel onComplete={reload} />
          <WorkItemList items={ctx?.work_items ?? []} workload={ctx?.workload ?? []} onGather={reload} />
          <EscalationQueue onResolve={reload} />
          <AutonomyFeed />
        </div>
        <div>
          <TrustLadder trust={trust} onTeach={reload} />
          <TimeSavings stats={stats} trust={trust} />
          <TrustEventStream />
        </div>
      </div>
    </div>
  );
}
