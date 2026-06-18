import { useState } from "react";
import { provisionTenant, setTrustKey, whoami, gather } from "../api";

type Step = "choose" | "create" | "created" | "existing";

interface Created { tenant: string; api_key: string; categories: string[] }

export function Onboarding({ onEnter, onDismiss }: {
  onEnter: (key: string) => void;     // user committed to a workspace
  onDismiss?: () => void;             // close without choosing (only when a key already exists)
}) {
  const [step, setStep] = useState<Step>("choose");
  const [name, setName] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [repo, setRepo] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const useDemo = () => { setTrustKey("demo-key"); onEnter("demo-key"); };

  const doCreate = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await provisionTenant(name.trim() || "My team");
      setCreated(out);
      setTrustKey(out.api_key);   // make the key live so an optional repo connect works
      setStep("created");
    } catch (e) {
      setErr(String(e).replace("Error: ", ""));
    } finally { setBusy(false); }
  };

  const enterCreated = async () => {
    if (!created) return;
    setBusy(true); setErr(null);
    try {
      if (repo.trim()) await gather(repo.trim());
      onEnter(created.api_key);
    } catch (e) {
      setErr(String(e).replace("Error: ", ""));
    } finally { setBusy(false); }
  };

  const useExisting = async () => {
    const k = keyInput.trim();
    if (!k) return;
    setBusy(true); setErr(null);
    setTrustKey(k);
    try {
      const who = await whoami();          // validates the key
      onEnter(k);
      void who;
    } catch {
      setErr("That key isn't valid. Check it and try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="onboard-overlay">
      <div className="onboard-card">
        {onDismiss && <button className="onboard-x" onClick={onDismiss} aria-label="close">×</button>}

        <div className="onboard-brand">
          <span className="live-ring" />
          <span>DailyGate</span>
        </div>

        {step === "choose" && (
          <>
            <h2 className="onboard-title">Earned autonomy, from zero.</h2>
            <p className="onboard-lead">
              DailyGate starts every action <b>gated</b> and earns the right to act as you
              approve it. Watch a fresh workspace climb from observe-only to autonomous.
            </p>
            <div className="onboard-opts">
              <button className="onboard-opt primary" onClick={() => setStep("create")}>
                <span className="opt-emoji">🚀</span>
                <span className="opt-title">Create your workspace</span>
                <span className="opt-sub">A new org where every category starts at L0 — earn it live</span>
              </button>
              <button className="onboard-opt" onClick={useDemo}>
                <span className="opt-emoji">🎬</span>
                <span className="opt-title">Explore the demo</span>
                <span className="opt-sub">A seeded org with trust already earned across categories</span>
              </button>
              <button className="onboard-opt subtle" onClick={() => setStep("existing")}>
                <span className="opt-emoji">🔑</span>
                <span className="opt-title">I have a workspace key</span>
                <span className="opt-sub">Paste an existing X-Trust-Key</span>
              </button>
            </div>
          </>
        )}

        {step === "create" && (
          <>
            <h2 className="onboard-title">Name your workspace</h2>
            <p className="onboard-lead">This is your org. Its trust is fully isolated from everyone else's.</p>
            <input className="repo-input onboard-input" placeholder="e.g. Acme Eng"
              value={name} autoFocus disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doCreate()} />
            {err && <div className="repo-msg err">✗ {err}</div>}
            <div className="onboard-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setStep("choose")}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={doCreate}>
                {busy ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </>
        )}

        {step === "created" && created && (
          <>
            <h2 className="onboard-title">Workspace ready — everything gated</h2>
            <p className="onboard-lead">
              <b>{created.categories.length} categories</b> start at <b>L0 (observe-only)</b>.
              Approve actions to earn autonomy; one override resets it.
            </p>
            <div className="onboard-keybox">
              <div className="keybox-label">Your workspace key — save it</div>
              <code className="keybox-key">{created.api_key}</code>
              <button className="btn btn-ghost keybox-copy"
                onClick={() => navigator.clipboard?.writeText(created.api_key)}>Copy</button>
            </div>
            <div className="onboard-field">
              <label>Connect a repo now (optional)</label>
              <input className="repo-input" placeholder="owner/repo — e.g. facebook/react"
                value={repo} disabled={busy}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enterCreated()} />
            </div>
            {err && <div className="repo-msg err">✗ {err}</div>}
            <div className="onboard-actions">
              <button className="btn btn-primary wide" disabled={busy} onClick={enterCreated}>
                {busy ? "Setting up…" : "Enter workspace →"}
              </button>
            </div>
          </>
        )}

        {step === "existing" && (
          <>
            <h2 className="onboard-title">Enter your workspace key</h2>
            <input className="repo-input onboard-input" placeholder="dgk_… (or demo-key)"
              value={keyInput} autoFocus disabled={busy}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && useExisting()} />
            {err && <div className="repo-msg err">✗ {err}</div>}
            <div className="onboard-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setStep("choose")}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={useExisting}>
                {busy ? "Checking…" : "Enter →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
