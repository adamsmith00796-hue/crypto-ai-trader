"""Plain-English status: why the bot isn't in a trade, a daily Telegram check-in, and an alert when
the live side reports an error. So problems reach Adam without him having to spot them."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from . import alerts
from .data import DATA_DIR

CHECKIN_FILE = DATA_DIR / "checkin.json"
CHECKIN_HOUR = 9  # Sydney time
log = logging.getLogger(__name__)


def why_waiting(state: dict) -> str | None:
    """One line on what's stopping a buy, or None while the bot holds a coin."""
    live = state.get("live") or {}
    if any(v >= 1 for v in (live.get("holdings") or {}).values()):
        return None
    if live.get("halted"):
        return f"Safety switch tripped on {live['halted']}: trading is stopped."
    scan = state.get("scanner") or []
    if not scan:
        return "Waiting for price data."
    labels = {d["key"]: d["label"] for d in state.get("dots") or []}
    best = max(s["green"] for s in scan)
    top = [s for s in scan if s["green"] == best]
    coins = ", ".join(s["coin"] for s in top[:3]) + (" and others" if len(top) > 3 else "")
    brake = (state.get("news_brake") or {}).get("on")
    weather = (state.get("market") or {}).get("btc_above_200") is False
    blocks = [t for t, on in (("the news brake is on", brake), ("Bitcoin is below its 200-day average", weather)) if on]
    if best >= len(labels) and labels:
        return f"{coins} on all {best} dots, " + (f"but {' and '.join(blocks)}, so no buy today." if blocks else "buying at the next check.")
    missing = sorted({labels.get(k, k) for s in top for k, on in s["dots"].items() if not on})
    line = f"Waiting: best is {coins} on {best} of {len(labels)} dots (missing {', '.join(missing)})."
    return line + (f" Also {' and '.join(blocks)}." if blocks else "")


def message(state: dict) -> str:
    live = state.get("live") or {}
    held = {c: v for c, v in (live.get("holdings") or {}).items() if v >= 1}
    holding = ", ".join(f"{c} ${v:,.0f}" for c, v in held.items()) or "no coins"
    lines = [f"☀️ Bot check-in: ${live.get('equity') or 0:,.0f} (${live.get('usdc') or 0:,.0f} cash, holding {holding})"]
    if why := state.get("waiting"):
        lines.append(why)
    health = (state.get("health") or {}).get("verdict")
    if health:
        lines.append(f"Health: {health}")
    if live.get("error"):
        lines.append(f"⚠️ {live['error']}")
    return "\n".join(lines)


def notify(state: dict) -> None:
    """Send the morning check-in once a day, and each different live error once a day."""
    try:
        now = datetime.now(alerts.LOCAL_TZ)
        today = now.date().isoformat()
        sent = json.loads(CHECKIN_FILE.read_text()) if CHECKIN_FILE.exists() else {}
        changed = False
        error = (state.get("live") or {}).get("error")
        if error and sent.get("error") != f"{today}:{error}":
            alerts.send(f"⚠️ Trading bot problem: {error}")
            sent["error"] = f"{today}:{error}"
            changed = True
        if now.hour >= CHECKIN_HOUR and sent.get("day") != today:
            alerts.send(message(state))
            sent["day"] = today
            changed = True
        if changed:
            CHECKIN_FILE.write_text(json.dumps(sent))
    except Exception as e:  # a failed message must never stop the bot
        log.warning("check-in failed: %s", type(e).__name__)
