import type { WorkItem, Workload } from "../types";

// GitHub-like list of open work across all sources, with capacity context.
export function WorkItemList({ items, workload }: { items: WorkItem[]; workload: Workload[] }) {
  const loadOf = (a: string | null) =>
    workload.find((w) => w.assignee === a)?.est_load_score ?? null;

  return (
    <div className="card">
      <div className="card-head"><h2>Work across all tools</h2></div>
      <ul className="work-list">
        {items.map((it) => {
          const load = loadOf(it.owner_suggested);
          return (
            <li key={it.id} className="work-row">
              <span className={`src src-${it.source}`}>{it.source}</span>
              <span className="wid">{it.id}</span>
              <span className="title">{it.title}</span>
              {it.is_duplicate_of && <span className="tag tag-dup">dup → {it.is_duplicate_of}</span>}
              {it.status === "stale" && <span className="tag tag-stale">stale {it.age_days}d</span>}
              <span className="owner">
                {it.owner_suggested ?? "unassigned"}
                {load !== null && load > 70 && <span className="tag tag-over">overloaded {load}</span>}
              </span>
            </li>
          );
        })}
        {items.length === 0 && <li className="empty">No work items.</li>}
      </ul>
    </div>
  );
}
