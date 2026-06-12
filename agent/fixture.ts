// Embedded fake state for the WALKING SKELETON — proves the spine before the
// real data API exists. Mirrors /contract/fake_context.json. Person B's live
// /context replaces this at the handshake (~2:30) via a Guild integration.

export const FIXTURE = {
  work_items: [
    { id: "gh-412", source: "github", title: "Fix login race condition", owner_suggested: "sasha", age_days: 0, status: "open", is_duplicate_of: "gh-389", type: "task" },
    { id: "gh-389", source: "github", title: "Login intermittently fails under load", owner_suggested: "sasha", age_days: 14, status: "open", is_duplicate_of: null, type: "task" },
    { id: "gh-420", source: "github", title: "Upgrade to Node 24", owner_suggested: null, age_days: 1, status: "open", is_duplicate_of: null, type: "task" },
    { id: "gh-377", source: "github", title: "Refactor auth middleware", owner_suggested: "sasha", age_days: 7, status: "open", is_duplicate_of: null, type: "review" },
    { id: "email-7", source: "email", title: "Thank-you note to design partner", owner_suggested: "sasha", age_days: 9, status: "stale", is_duplicate_of: null, type: "email" },
    { id: "email-3", source: "email", title: "Candidate decision — Jordan (eng hire)", owner_suggested: null, age_days: 4, status: "open", is_duplicate_of: null, type: "email" },
  ],
  workload: [
    { assignee: "sasha", kind: "person", open_tasks: 6, est_load_score: 82 },
    { assignee: "alex", kind: "person", open_tasks: 2, est_load_score: 30 },
    { assignee: "priya", kind: "person", open_tasks: 4, est_load_score: 55 },
    { assignee: "marco", kind: "person", open_tasks: 3, est_load_score: 45 },
    { assignee: "triage-bot", kind: "agent", open_tasks: 1, est_load_score: 15 },
  ],
  trust: [
    { category: "issue-triage", trust_level: "auto", approvals_count: 5, overrides_count: 0, ceiling: false },
    { category: "capacity-assignment", trust_level: "auto", approvals_count: 4, overrides_count: 0, ceiling: false },
    { category: "thank-you-note", trust_level: "auto", approvals_count: 3, overrides_count: 0, ceiling: false },
    { category: "nudge", trust_level: "auto", approvals_count: 3, overrides_count: 1, ceiling: false },
    { category: "code-review", trust_level: "ask", approvals_count: 2, overrides_count: 0, ceiling: false },
    { category: "candidate-decision", trust_level: "ask", approvals_count: 0, overrides_count: 0, ceiling: true },
  ],
};
