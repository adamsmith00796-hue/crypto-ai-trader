"""Run from cron, outside the bot: Telegram alert if the bot has stopped updating or isn't answering.
The bot can't report its own death, so this lives in a separate process. Repeats every 3 hours."""

import json
import time

import httpx

from app.bot import alerts
from app.bot.data import DATA_DIR

STATE = DATA_DIR / "watchdog.json"
STALE_SECONDS = 30 * 60
REPEAT_SECONDS = 3 * 3600


def problem() -> str | None:
    try:
        d = httpx.get("http://localhost:8000/api/bot", timeout=30).json()
    except Exception as e:
        return f"not answering ({type(e).__name__})"
    if not d.get("ready"):
        return "still starting" if time.time() - STATE.stat().st_mtime < STALE_SECONDS else "stuck starting up"
    age = time.time() - d["updated_at"]
    return f"no update for {age / 60:.0f} minutes" if age > STALE_SECONDS else None


def main() -> None:
    state = json.loads(STATE.read_text()) if STATE.exists() else {"last": 0}
    why = problem() if STATE.exists() else None
    if why and time.time() - state["last"] > REPEAT_SECONDS:
        alerts.send(f"🚨 Trading bot down: {why}. Claude needs to check the server.")
        state["last"] = time.time()
    elif not why and state["last"]:
        alerts.send("✅ Trading bot is back and updating.")
        state["last"] = 0
    STATE.write_text(json.dumps(state))


if __name__ == "__main__":
    main()
