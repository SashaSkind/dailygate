// Mirror of /contract/types.ts — keep in sync. Source of truth is the contract.
export type Source = "github" | "slack" | "email";
export type WorkStatus = "open" | "in_progress" | "stale" | "done";
export type WorkType = "task" | "email" | "review";
export interface WorkItem {
  id: string; source: Source; title: string;
  owner_suggested: string | null; age_days: number;
  status: WorkStatus; is_duplicate_of: string | null; type: WorkType;
}
export interface Workload {
  assignee: string; kind: "person" | "agent";
  open_tasks: number; est_load_score: number;
}
export type TrustLevel = "ask" | "auto";
export interface Trust {
  category: string; trust_level: TrustLevel;
  approvals_count: number; overrides_count: number; ceiling: boolean;
}
export interface Decision {
  id: string; item_id: string | null; category: string; action: string;
  stakes: "low" | "high"; reversible: boolean; was_autonomous: boolean;
  manager_response: "approved" | "overridden" | "edited" | "pending" | "n/a";
  timestamp: string;
}
export interface ContextSnapshot {
  work_items: WorkItem[]; workload: Workload[]; trust: Trust[];
}
