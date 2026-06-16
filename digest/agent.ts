// DailyGate — DIGEST capability. A scheduled (cron) agent that summarises the
// team's work and posts a short daily digest to Slack: what's open, what's stale,
// what got done, and the one thing that needs the manager. Designed to run on a
// time trigger so the manager gets a heartbeat without asking.
import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { slackTools } from "@guildai-services/guildai~slack";
import { z } from "zod";

const description = `
DailyGate digest — summarises recent repo activity and posts a concise daily digest
to a Slack channel. Meant to run on a daily schedule (time trigger).
`;

const systemPrompt = `
You are DailyGate's daily digest. Produce a short, useful summary for an engineering
manager and post it to Slack.

# Steps
1. Call github_issues_list_for_repo for the given repo to see current issues.
2. Summarise: how many are open, which look STALE (old + still open), anything that
   looks high-priority or stuck, and what was recently closed.
3. Call slack_conversations_list to find the target channel (use the provided
   channel if given; otherwise pick the most relevant team channel).
4. Post a concise digest with slack_chat_post_message. Format:
     *DailyGate daily digest*
     • Open: N  ·  Stale: M  ·  Closed recently: K
     • Needs you: <the one thing, or "nothing">
     • <1-2 short highlights>
Keep it tight. Do not invent items; only report what GitHub returned.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    repo: z.string().describe("owner/repo to summarise"),
    channel: z.string().default("").describe("Slack channel id/name to post to (optional)"),
  }),
  inputTemplate: "Post the daily digest for repo {{repo}}. Channel: {{channel}}",
  tools: {
    ...pick(gitHubTools, ["github_issues_list_for_repo"]),
    ...pick(slackTools, ["slack_conversations_list", "slack_chat_post_message"]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
