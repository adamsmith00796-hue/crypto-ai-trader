"""Telegram alerts for the paper account: one message per buy and per sell, nothing else.

Uses the existing Telegram bot's credentials: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from
backend/.env if set there, otherwise from ~/telegram-claude-bot/.env. Sent alerts are
remembered in backend/data/alerts_sent.json so each buy or sell is only messaged once.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx

from .data import DATA_DIR

ENV_FILES = [Path(__file__).resolve().parent.parent.parent / ".env", Path.home() / "telegram-claude-bot" / ".env"]
SENT_FILE = DATA_DIR / "alerts_sent.json"
log = logging.getLogger(__name__)


def _credentials() -> tuple[str, str] | None:
    for f in ENV_FILES:
        if not f.exists():
            continue
        env: dict[str, str] = {}
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
        token = os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN")
        chat = os.environ.get("TELEGRAM_CHAT_ID") or env.get("TELEGRAM_CHAT_ID")
        if token and chat:
            return token, chat
    return None


def _money(x: float) -> str:
    sign = "-" if x < 0 else ""
    x = abs(x)
    return f"{sign}${x:,.0f}" if x >= 100 else f"{sign}${x:,.2f}" if x >= 1 else f"{sign}${x:.4g}"


def _where(x: dict) -> str:
    return "paper, Bitcoin core" if x["sleeve"] == "core" else "paper, top-10 slice"


def _buy_text(p: dict) -> str:
    return (f"🟢 BUY {p['coin']} ({_where(p)})\n"
            f"Price {_money(p['entry_price'])} · amount {_money(p['cost'])}\n"
            f"Stop {_money(p['stop'])} · all six dots green")


def _sell_text(t: dict) -> str:
    icon = "✅" if t["pnl"] >= 0 else "🔴"
    return (f"{icon} SELL {t['coin']} ({_where(t)})\n"
            f"Bought {_money(t['entry_price'])} on {t['entry_date']}, sold {_money(t['exit_price'])}\n"
            f"Result {_money(t['pnl'])} ({t['pnl_pct']:+.1f}%) · {t['reason'].lower()}")


def events(paper: dict) -> list[tuple[str, str]]:
    """Every buy and sell in the paper account, as (unique key, message)."""
    out = []
    for t in sorted(paper["trades"], key=lambda t: (t["exit_date"], t["entry_date"])):
        buy_key = f"buy:{t['sleeve']}:{t['coin']}:{t['entry_date']}"
        out.append((buy_key, _buy_text({**t, "stop": t["entry_stop"]})))
        out.append((f"sell:{t['sleeve']}:{t['coin']}:{t['exit_date']}", _sell_text(t)))
    for p in paper["positions"]:
        out.append((f"buy:{p['sleeve']}:{p['coin']}:{p['entry_date']}", _buy_text({**p, "stop": p["entry_stop"]})))
    return out


def notify(paper: dict) -> None:
    """Send any buy or sell alerts not sent yet. Unsent ones are retried next refresh."""
    creds = _credentials()
    if not creds or not paper.get("started"):
        return
    sent = set(json.loads(SENT_FILE.read_text())) if SENT_FILE.exists() else set()
    token, chat = creds
    with httpx.Client(timeout=15) as client:
        for key, text in events(paper):
            if key in sent:
                continue
            try:
                r = client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text})
                r.raise_for_status()
            except httpx.HTTPError as e:
                log.warning("Telegram alert failed, will retry: %s", type(e).__name__)
                break
            sent.add(key)
            SENT_FILE.write_text(json.dumps(sorted(sent)))
