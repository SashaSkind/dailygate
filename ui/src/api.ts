// Client for Person B's data API. All calls go through the Vite /api proxy.
import type { ContextSnapshot, Decision, TrustEvent } from "./types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const getContext = () => get<ContextSnapshot>("/context");

export const getAutonomyFeed = () =>
  get<{ decisions: Decision[] }>("/feeds/autonomy").then((r) => r.decisions);

export const getEscalationQueue = () =>
  get<{ decisions: Decision[] }>("/feeds/escalations").then((r) => r.decisions);

export const getTrustEvents = (limit = 30) =>
  get<{ events: TrustEvent[] }>(`/feeds/trust-events?limit=${limit}`).then((r) => r.events);

export const getHealth = () =>
  get<{ status: string; langfuse: string }>("/health");

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
