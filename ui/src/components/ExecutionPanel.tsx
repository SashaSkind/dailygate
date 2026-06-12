import { useState, useCallback } from "react";
import type { DemoResult, DemoStep, GithubDetails } from "../types";
import { runDemo } from "../api";

const STEP_ICONS: Record<string, string> = {
  received: "📥",
  classify: "🏷️",
  trust_check: "🔐",
  route: "⚡",
  analyze: "🔍",
  act: "✅",
  record: "📊",
  saved: "⏱️",
  ceiling: "⛔",
  escalate: "↑",
};

const DEMO_LABELS: Record<string, string> = {
  "gh-412":  "gh-412 · duplicate issue",
  "gh-389":  "gh-389 · stale nudge",
  "gh-377":  "gh-377 · code review",
  "email-7": "email-7 · thank-you note",
  "email-3": "email-3 · hiring decision",
};

function GithubCard({ gh, before }: { gh: GithubDetails; before: boolean }) {
  return (
    <div className="github-issue-card">
      <div className="github-issue-header">
        <span style={{ color: "#6b7280", fontSize: 12 }}>●</span>
        <span className="github-issue-title">#{gh.number} {before ? "(before)" : "(after agent acted)"}</span>
        <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>
          {before ? gh.state_before : gh.state_after}
        </span>
      </div>
      <div className="github-issue-body">{gh.body}</div>
      <div className="github-issue-meta">
        <span>by @{gh.author}</span>
        <span>·</span>
        <span>{gh.created}</span>
        <span>·</span>
        <span>labels: {before
          ? (gh.labels_before.length ? gh.labels_before.join(", ") : "none")
          : gh.labels_after.join(", ")
        }</span>
        {!before && gh.assignee && <><span>·</span><span>assigned: @{gh.assignee}</span></>}
      </div>
      {!before && (
        <div className="github-issue-after">
          {gh.state_after === "closed" && (
            <div className="github-issue-change">✓ Closed as duplicate</div>
          )}
          {gh.assignee && (
            <div className="github-issue-change">✓ Assigned to @{gh.assignee}</div>
          )}
          <div className="github-comment-box">
            💬 {gh.comment_posted}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExecutionPanel({ onComplete }: { onComplete?: () => void }) {
  const [running, setRunning]     = useState(false);
  const [steps, setSteps]         = useState<DemoStep[]>([]);
  const [result, setResult]       = useState<DemoResult | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [showAfter, setShowAfter] = useState(false);

  const trigger = useCallback(async (itemId: string) => {
    setRunning(true);
    setSteps([]);
    setResult(null);
    setActiveItem(itemId);
    setShowAfter(false);

    let data: DemoResult;
    try {
      data = await runDemo(itemId);
    } catch {
      setRunning(false);
      return;
    }

    // Animate steps appearing with their specified delays
    const base = Date.now();
    for (const step of data.steps) {
      const wait = step.delay_ms - (Date.now() - base);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setSteps((prev) => [...prev, step]);
    }

    // Show the "after" state of the GitHub issue after act step
    setTimeout(() => setShowAfter(true), 600);

    setResult(data);
    setRunning(false);
    onComplete?.();
  }, [onComplete]);

  const gh = result?.item.github as GithubDetails | null | undefined;

  return (
    <div className="card execution-panel">
      <div className="card-head">
        <div>
          <div className="card-title">Agent execution — live</div>
          <div className="card-sub">Watch the agent work through a task step by step</div>
        </div>
      </div>

      <div className="demo-trigger-row">
        <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", marginRight: 4 }}>Run demo:</span>
        {Object.entries(DEMO_LABELS).map(([id, label]) => (
          <button
            key={id}
            className={`demo-item-btn${activeItem === id ? " active" : ""}`}
            onClick={() => trigger(id)}
            disabled={running}
          >
            {label}
          </button>
        ))}
      </div>

      {/* GitHub issue: before */}
      {gh && steps.some((s) => s.type === "analyze" || s.type === "act") && (
        <GithubCard gh={gh} before={!showAfter} />
      )}

      {/* Step list */}
      {steps.length > 0 ? (
        <ul className="step-list">
          {steps.map((s) => (
            <li key={s.id} className={`step-row ${s.type}${s.type === "trust_check" && s.pass ? " pass" : ""}`}>
              <span className="step-icon">{STEP_ICONS[s.type] ?? "·"}</span>
              <div className="step-body">
                <div className="step-text">{s.text}</div>
                <div className="step-sub">{s.sub}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : !running ? (
        <p className="empty">Pick a demo item above to watch the agent work.</p>
      ) : null}

      {running && (
        <div className="step-spinner">
          <div className="spinner-dot" />
          <div className="spinner-dot" />
          <div className="spinner-dot" />
          <span>Agent working…</span>
        </div>
      )}

      {result && !running && (
        <div className={`outcome-banner ${result.outcome.toLowerCase()}`}>
          {result.outcome === "ACTED" ? (
            <>
              <span>✓</span>
              <span>
                Acted autonomously · saved ~{result.time_saved_min} min ·
                trust {(result.trust_before.trust_score * 100).toFixed(0)}%
                → {(result.trust_after.trust_score * 100).toFixed(0)}%
                {result.score_delta !== 0 && ` (${result.score_delta > 0 ? "+" : ""}${(result.score_delta * 100).toFixed(1)}%)`}
              </span>
            </>
          ) : (
            <>
              <span>↑</span>
              <span>Escalated to your queue — awaiting manager decision</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
