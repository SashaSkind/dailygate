# DailyGate trust API — host-agnostic container (Hugging Face Spaces / Cloud Run / any).
FROM python:3.11-slim

# HF Spaces (and good practice) run the container as a non-root user (uid 1000).
# Create it and own the app dir so the runtime SQLite file is writable.
RUN useradd -m -u 1000 user

WORKDIR /app
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=user:user . .

USER user
ENV HOME=/home/user
# /app is root-owned; write the runtime SQLite file to the user's writable home.
ENV DAILYGATE_DB=/home/user/dailygate.db

# HF Spaces routes to app_port (set in README front-matter) — default 7860.
# Other hosts (Cloud Run) inject $PORT; honour it if present.
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
