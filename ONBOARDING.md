# Onboarding — set up DailyGate for your team

DailyGate is an autonomous chief-of-staff agent that earns its autonomy over time.
This gets it running on **your** Guild workspace and **your** repo in ~5 minutes.

> Most steps are one command. The integration connects (GitHub / Slack / Gmail) are
> OAuth, so they happen in the browser — there's no way around that, by design.

## What you'll have at the end
- A trigger that wakes the agent whenever a GitHub issue is opened
- The agent triaging your work and acting on the routine stuff, escalating the rest
- A trust dashboard that shows what it's earned the right to do on its own

---

## 1. Authenticate to Guild
```bash
npx -y @guildai/cli@0.12.3 auth login      # opens a browser
npx -y @guildai/cli@0.12.3 auth status     # confirm
```

## 2. Connect your integrations (browser — app.guild.ai)
In your workspace → **Integrations**, connect:
- **GitHub** — so the agent can read + act on issues, and the trigger can fire
- **Slack** *(optional)* — so it can read team channels and post
- **Gmail** *(optional)* — so it can send routine emails

> OAuth apps can't be connected from the CLI; this is the one browser step.

## 3. Install DailyGate + create your trigger (one command)
```bash
./onboard.sh <your-workspace> <owner/repo>
# e.g.  ./onboard.sh daily-gate/team SashaSkind/dailygate
```
This installs the router + trigger agent into your workspace and creates the
`issues.opened` trigger on your repo.

## 4. Start the trust dashboard
Until the trust API is hosted, run it locally:
```bash
cd data/api && python -m uvicorn main:app --port 8001     # the trust engine
cd ui && npm install && npm run dev                        # → http://localhost:5173
```
*(Once the API is hosted, point `ui/.env`'s `VITE_API_BASE` at the hosted URL.)*

## 5. Try it
Open an issue in your repo. Within seconds the agent wakes, triages it, and acts
or escalates. Watch the autonomy feed + trust dashboard update.

---

## How autonomy grows
Every decision the agent makes is a signal. Approve what it did and it earns more
trust in that category; override it and it pulls back. A Bayesian model turns that
history into a score, and the score changes which permission tier handles the work
next — from read-only **observer**, to **reversible** (comment/label), to **routine**
(assign/close/email). Some categories (like hiring decisions) are capped forever.

## Troubleshooting
- *Trigger doesn't fire* → confirm GitHub is connected (step 2) and the repo in
  `--service-config` matches exactly.
- *Agent can't act on Slack/GitHub* → that integration isn't connected for your
  workspace yet.
- *Dashboard empty* → the trust API isn't reachable; check it's running on :8001.
