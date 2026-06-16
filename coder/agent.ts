// DailyGate — CODER capability. Given a trivial GitHub issue, it spins up a
// sandboxed coding container, makes the smallest correct fix, and opens a PR via
// the GitHub API. This is the "it doesn't just route work, it does work" tier —
// and it's its own earned-autonomy category: it starts gated and proves itself.
"use agent";

import { type Task, consoleTools, agent, pick } from "@guildai/agents-sdk";
import { ExperimentalCodingTools as codingTools } from "@guildai-services/guildai~experimental-coding";
import { CONTAINER_IMAGE, codingAgentToolsFrom } from "@guildai/guildai~sys-experimental-coding";
import codingAgentTool from "@guildai/guildai~sys-experimental-coding/tool";
import { gitHubTools } from "@guildai-services/guildai~github";
import { z } from "zod";

const description = `
DailyGate coder — fixes a TRIVIAL GitHub issue (typo, lint, one-line change) in a
sandboxed container and opens a pull request. Refuses anything non-trivial.
`;

const inputSchema = z.object({
  repo: z.string().describe("owner/repo, e.g. SashaSkind/dailygate"),
  issue_number: z.number().describe("the GitHub issue number to fix"),
  title: z.string().describe("the issue title"),
  body: z.string().default("").describe("the issue body / description"),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  type: z.literal("text"),
  text: z.string().describe("what was done, including the PR URL if one was opened"),
});
type Output = z.infer<typeof outputSchema>;

const tools = {
  ...codingTools,                 // experimental_coding_create / _delete
  communicate: codingAgentTool,   // talk to the coding agent inside the container
  ...consoleTools,
};
type Tools = typeof tools;

// GitHub API primitives the coding agent needs to clone + branch + commit + PR.
const githubForCoder = codingAgentToolsFrom({
  ...pick(gitHubTools, [
    "github_repos_download_zipball_archive",
    "github_git_get_ref",
    "github_git_create_ref",
    "github_git_get_commit",
    "github_git_create_blob",
    "github_git_create_tree",
    "github_git_create_commit",
    "github_git_update_ref",
    "github_pulls_create",
  ]),
});

async function run({ repo, issue_number, title, body }: Input, task: Task<Tools>): Promise<Output> {
  await task.console.log(`coder: ${repo}#${issue_number} — ${title}`);
  const { container_id } = await task.tools.experimental_coding_create({ image: CONTAINER_IMAGE });
  try {
    const message = `You are a careful junior engineer working for DailyGate. Repo: ${repo}.

GitHub issue #${issue_number}: "${title}"
${body || "(no description)"}

Do ONLY the following, and nothing more:
1. Download the repo ${repo} and inspect the relevant files.
2. Judge whether this is TRIVIAL (a typo, a lint fix, a tiny one-line change, a doc
   tweak). If it is NOT clearly trivial and safe, STOP and reply with
   "ESCALATE: not trivial enough to fix autonomously" and a one-line reason. Do not
   guess at risky changes.
3. If trivial: make the smallest correct change. Create a branch
   "dailygate/fix-${issue_number}", commit just that change, and open a pull request
   against the default branch titled "Fix #${issue_number}: ${title}". The PR body
   should say it was opened autonomously by DailyGate and include "Closes #${issue_number}".
4. Reply with the PR URL.`;

    const { text } = await task.tools.communicate({
      container_id,
      message,
      tools: githubForCoder,
    });
    return { type: "text", text };
  } finally {
    await task.tools.experimental_coding_delete({ container_id });
  }
}

export default agent({ description, inputSchema, outputSchema, tools, run });
