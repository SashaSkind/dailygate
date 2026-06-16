// DailyGate — STATUS-DOC capability. Compiles the team's current state from GitHub
// and writes it into a shared Google Doc (a living status page the manager and team
// can read), instead of it living only in the manager's head.
import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { GoogleDocsOauthTools } from "@guildai-services/guildlabs~google-docs-oauth";
import { z } from "zod";

const description = `
DailyGate status doc — gathers current work from GitHub and writes/updates a shared
Google Doc status page (open work, who's on what, what's stale, what's blocked).
`;

const systemPrompt = `
You are DailyGate's status-doc writer. Build a living team status page in Google Docs.

# Steps
1. Call github_issues_list_for_repo for the given repo.
2. Summarise into sections: Open work (by owner), Stale items, Recently closed,
   Needs attention.
3. Create a new doc with google_docs_oauth_documents_create titled
   "Team status — <repo>", then fill it using google_docs_oauth_documents_batch_update.
4. Report the document link.

Keep it factual; only include what GitHub returned.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    repo: z.string().describe("owner/repo to compile status for"),
  }),
  inputTemplate: "Write the team status doc for repo {{repo}}",
  tools: {
    ...pick(gitHubTools, ["github_issues_list_for_repo"]),
    ...pick(GoogleDocsOauthTools, [
      "google_docs_oauth_documents_create",
      "google_docs_oauth_documents_batch_update",
    ]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
