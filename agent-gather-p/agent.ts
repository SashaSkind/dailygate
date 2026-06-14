// DailyGate — GATHER agent. Fetches REAL work signals from your connected Slack
// (via Guild's native Slack integration) and triages each into the act-vs-escalate
// flow. This is the live "it reads my actual Slack" proof — Guild fetches, the
// agent reasons.

import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { slackTools } from "@guildai-services/guildai~slack";
import { ComposioGmailTools } from "@guildai-services/sashaskind~composio-gmail";

const description = `
DailyGate GATHER agent — reads recent messages from the team's Slack and surfaces
the work hiding in them (asks, requests, follow-ups), triaging each as act-alone or
escalate.
`;

const systemPrompt = `
You are DailyGate's GATHER step. You have REAL access to the manager's Slack.

# What to do
1. Call slack_conversations_list to find channels, pick the most relevant team
   channel (e.g. general, eng, team).
2. Call slack_conversations_history on it to read the recent messages.
3. From those REAL messages, extract the actual WORK: requests, asks, follow-ups,
   "can someone…", bug reports, thank-yous owed.
4. For each, classify a CATEGORY (issue-triage, capacity-assignment, nudge,
   thank-you-note, code-review, candidate-decision) and decide:
   - high-stakes & irreversible → ESCALATE (always)
   - routine & reversible & confident → ACT
   - else → ESCALATE

# Acting
- If a message asks to SEND AN EMAIL (e.g. "send a thank-you email to X"), ACTUALLY
  send it: call composio_gmail_composio_gmail_send with user_id "dailygate" and
  arguments { recipient_email (the address from the message), subject, body }. Write
  a short warm subject + body. Really invoke the tool — do not just acknowledge.
- You may also post a brief confirmation back to the channel with slack_chat_post_message.

# Output
First show WHAT YOU FETCHED (channel + a few real message snippets) so it's clear
this is live Slack data. Then a tight triage list:
  ACTED: <bullets — what you handled and why>
  ESCALATED: <bullets — what needs the manager>
Be concise. Do NOT invent messages — only triage what Slack actually returned.
`;

export default llmAgent({
  description,
  tools: {
    ...pick(slackTools, [
      "slack_conversations_list",
      "slack_conversations_history",
      "slack_chat_post_message",
    ]),
    ...pick(ComposioGmailTools, ["composio_gmail_composio_gmail_send"]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
