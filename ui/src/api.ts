import type { ContextSnapshot, Decision, TrustEvent, DemoResult, DashboardStats } from "./types";

const BASE = "/api";

// ── Tenant key ────────────────────────────────────────────────────────────────
// Every call is scoped to the org that owns this key (sent as X-Trust-Key). The
// demo org uses "demo-key"; a real org provisions its own via POST /tenants and
// swaps it in here. Persisted in localStorage so it survives reloads.
const KEY_STORAGE = "dailygate_trust_key";

export function getTrustKey(): string {
  return localStorage.getItem(KEY_STORAGE) || "demo-key";
}

export function setTrustKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key.trim() || "demo-key");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Trust-Key": getTrustKey(), ...extra };
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const getContext     = () => get<ContextSnapshot>("/context");
export const getHealth      = () => get<{ status: string; langfuse: string }>("/health");
export const getStats       = () => get<DashboardStats>("/feeds/stats");
export const getTrustEvents = (limit = 25) => get<{ events: TrustEvent[] }>(`/feeds/trust-events?limit=${limit}`).then((r) => r.events);
export const getAutonomyFeed= () => get<{ decisions: Decision[] }>("/feeds/autonomy").then((r) => r.decisions);
export const getEscalationQueue = () => get<{ decisions: Decision[] }>("/feeds/escalations").then((r) => r.decisions);

// Confirm a key resolves to a tenant — used by the org switcher to validate input.
export const whoami = () => get<{ tenant: string }>("/whoami");

export async function runDemo(itemId: string): Promise<DemoResult> {
  const r = await fetch(`${BASE}/demo/run?item_id=${encodeURIComponent(itemId)}&record=true`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`demo/run → ${r.status}`);
  return r.json();
}

export async function resolveEscalation(
  decision: Decision,
  response: "approved" | "overridden" | "edited",
): Promise<void> {
  const r = await fetch(`${BASE}/decision`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ...decision, manager_response: response }),
  });
  if (!r.ok) throw new Error(`resolve → ${r.status}`);
}
