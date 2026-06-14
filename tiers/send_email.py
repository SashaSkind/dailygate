#!/usr/bin/env python3
# Real email send for the demo, straight from your Gmail via SMTP + an App Password.
# (Composio's managed Gmail OAuth is blocked by Google's app-verification, so this is
#  the reliable "from my own account" path.)
#
# Setup (one time):
#   1. Google Account → Security → 2-Step Verification (must be ON)
#   2. Security → App passwords → create one for "Mail" → copy the 16-char code
#   3. export GMAIL_USER="you@gmail.com"  GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"
#
# Usage:  python3 send_email.py <to> <subject> <body>
import os, sys, smtplib
from email.mime.text import MIMEText

user = os.environ.get("GMAIL_USER")
pw   = os.environ.get("GMAIL_APP_PASSWORD")
to   = sys.argv[1] if len(sys.argv) > 1 else (user or "")
subj = sys.argv[2] if len(sys.argv) > 2 else "Hello from DailyGate"
body = sys.argv[3] if len(sys.argv) > 3 else "Sent autonomously by DailyGate."

if not user or not pw:
    print("SMTP_NOT_CONFIGURED")        # caller falls back to naming the Composio tool
    sys.exit(2)

msg = MIMEText(body)
msg["Subject"], msg["From"], msg["To"] = subj, user, to
with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
    s.login(user, pw)
    s.sendmail(user, [to], msg.as_string())
print(f"SENT to {to}")
