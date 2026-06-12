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
export type AutonomyLevel = 0 | 1 | 2;
export type RiskProfile = "low" | "medium" | "high";
export interface Trust {
  category: string; autonomy_level: AutonomyLevel; ceiling: boolean;
  trust_level?: "ask" | "auto";
  trust_score: number; trust_confidence: number;
  approvals_count: number; overrides_count: number;
  auto_threshold?: number; risk_profile?: RiskProfile; last_event?: string;
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
export type TrustEventType = "promoted" | "demoted" | "score_updated" | "created" | "threshold_adjusted";
export interface TrustEvent {
  id: string;
  category: string;
  event_type: TrustEventType;
  old_level: string | null;
  new_level: string | null;
  old_score: number | null;
  new_score: number;
  confidence: number;
  reason: string;
  decision_id: string | null;
  timestamp: string;
}
