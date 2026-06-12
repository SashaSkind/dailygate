// Client for Person B's data API. All calls go through the Vite /api proxy.
import type { ContextSnapshot, Decision } from "./types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// GET /context — full snapshot (work items, workload, trust)
export const getContext = () => get<ContextSnapshot>("/context");

// Feeds for the dashboard (Person B serves these — see data/PLAN.md §6 B7)
export const getAutonomyFeed = () => get<Decision[]>("/feeds/autonomy");      // was_autonomous = true
export const getEscalationQueue = () => get<Decision[]>("/feeds/escalations"); // manager_response = "pending"

// Manager resolves an escalation → re-call POST /decision (upsert by id).
export async function resolveEscalation(
  decision: Decision,
  response: "approved" | "overridden" | "edited",
): Promise<void> {
  const r = await fetch(`${BASE}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...decision, manager_response: response }),
  });
  if (!r.ok) throw new Error(`resolve → ${r.status}`);
}
