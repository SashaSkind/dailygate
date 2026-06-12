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
  id: string; category: string; event_type: TrustEventType;
  old_level: string | null; new_level: string | null;
  old_score: number | null; new_score: number; confidence: number;
  reason: string; decision_id: string | null; timestamp: string;
}

export type StepType =
  | "received" | "classify" | "trust_check" | "route"
  | "analyze" | "act" | "record" | "saved"
  | "ceiling" | "escalate";

export interface DemoStep {
  id: number;
  type: StepType;
  text: string;
  sub: string;
  delay_ms: number;
  pass?: boolean;
}

export interface DemoResult {
  item: { id: string; title: string; source: string; category: string; github?: GithubDetails | null; email_preview?: string };
  routing: Trust & { tier: string };
  trust_before: Trust;
  trust_after: Trust;
  outcome: "ACTED" | "ESCALATED";
  time_saved_min: number;
  score_delta: number;
  steps: DemoStep[];
}

export interface GithubDetails {
  number: number;
  body: string;
  author: string;
  created: string;
  labels_before: string[];
  state_before: string;
  state_after: string;
  labels_after: string[];
  assignee: string | null;
  comment_posted: string;
}

export interface DashboardStats {
  total_autonomous: number;
  total_decisions: number;
  time_saved_min: number;
  escalation_count: number;
  promotions: number;
  demo_items: string[];
}
