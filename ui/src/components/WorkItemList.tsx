import { useState } from "react";
import type { WorkItem, Workload } from "../types";
import { gather } from "../api";

export function WorkItemList({
  items, workload, onGather,
}: { items: WorkItem[]; workload: Workload[]; onGather?: () => void }) {
  const loadOf = (a: string | null) =>
    workload.find((w) => w.assignee === a)?.est_load_score ?? null;

  const open = items.filter((i) => i.status !== "done");
  const liveGithub = items.some((i) => i.source === "github");

  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const connect = async () => {
    if (!repo.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await gather(repo.trim());
      setMsg(`✓ pulled ${out.synced} issues from ${out.repo}`);
      onGather?.();
    } catch (e) {
      setMsg(`✗ ${String(e).replace("Error: ", "")}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <span className="card-title">Work queue</span>
          <span className="card-sub">{liveGithub ? "live from GitHub" : "demo data"}</span>
        </div>
        <span className="badge badge-neutral">{open.length} open</span>
      </div>

      <div className="repo-connect">
        <input
          className="repo-input"
          placeholder="owner/repo — e.g. facebook/react"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && connect()}
          disabled={busy}
        />
        <button className="btn btn-blue" onClick={connect} disabled={busy || !repo.trim()}>
          {busy ? "Pulling…" : "Connect repo"}
        </button>
      </div>
      {msg && <div className={`repo-msg ${msg.startsWith("✓") ? "ok" : "err"}`}>{msg}</div>}

      <ul className="work-list scroll-list">
        {open.map((it) => {
          const load = loadOf(it.owner_suggested);
          const overloaded = load !== null && load > 70;
          return (
            <li key={it.id} className="work-item">
              <span className="work-src">{it.source}</span>
              <span className="work-id">{it.id}</span>
              <span className="work-title">
                {it.title}
                {it.is_duplicate_of && (
                  <span className="tag tag-dup"> dup→{it.is_duplicate_of}</span>
                )}
                {it.status === "stale" && (
                  <span className="tag tag-stale"> {it.age_days}d stale</span>
                )}
              </span>
              <span className="work-owner">
                {it.owner_suggested ?? "—"}
                {overloaded && <span className="tag tag-over"> ⚠{load}</span>}
              </span>
            </li>
          );
        })}
        {open.length === 0 && <li className="empty">All clear — no open work.</li>}
      </ul>
    </div>
  );
}
