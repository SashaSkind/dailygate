// DailyGate — SCHEDULER capability. Turns an escalation that needs a meeting
// (a candidate interview, a 1:1, a sync) into a real calendar event: checks
// free/busy and books it via Google Calendar. Lets escalations resolve into
// actions, not just decisions.
import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { GoogleCalendarOauthTools } from "@guildai-services/guildlabs~google-calendar-oauth";
import { z } from "zod";

const description = `
DailyGate scheduler — books a meeting on Google Calendar (candidate interview, 1:1,
team sync). Checks free/busy first, then creates the event.
`;

const systemPrompt = `
You are DailyGate's scheduler. Given a meeting request, book it on the manager's
Google Calendar.

# Steps
1. If a time window is given, call google_calendar_oauth_freebusy_query to check
   availability; pick a slot that's free.
2. Create the event with google_calendar_oauth_events_insert on the "primary"
   calendar: include the summary, attendees, start/end, and a short description.
3. Report the scheduled time and the event link.

Keep it simple. If no time is given, propose the next reasonable business-hours slot.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    summary: z.string().describe("meeting title, e.g. 'Interview: Jordan (eng)'"),
    attendee_email: z.string().default("").describe("attendee email (optional)"),
    when: z.string().default("").describe("preferred time/window, natural language (optional)"),
  }),
  inputTemplate: "Schedule a meeting: {{summary}}. Attendee: {{attendee_email}}. When: {{when}}",
  tools: {
    ...pick(GoogleCalendarOauthTools, [
      "google_calendar_oauth_freebusy_query",
      "google_calendar_oauth_events_insert",
      "google_calendar_oauth_events_list",
    ]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
