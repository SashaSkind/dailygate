import type { WorkItem, Workload } from "../types";

export function WorkItemList({ items, workload }: { items: WorkItem[]; workload: Workload[] }) {
  const loadOf = (a: string | null) =>
    workload.find((w) => w.assignee === a)?.est_load_score ?? null;

  const open = items.filter((i) => i.status !== "done");

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Work queue</span>
        <span className="pill pill-num">{open.length} open</span>
      </div>

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
        {open.length === 0 && <li className="empty">All clear.</li>}
      </ul>
    </div>
  );
}
