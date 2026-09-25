"""News brake: pause NEW buys for the day when crisis headlines hit (hacks, collapses, frozen withdrawals).

It never forces a sale and never buys, it only skips a day of new entries. UNTESTED: there is no
history of headlines to backtest against, so it is kept deliberately narrow: at least two crisis
headlines in the last 24 hours across CoinDesk and Cointelegraph. Braked days are remembered in
backend/data/news_brake.json so the paper account replays the same way every time.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import datetime

from ..news import get_news
from .data import DATA_DIR

BRAKE_FILE = DATA_DIR / "news_brake.json"
MIN_HEADLINES = 2
DAY_MS = 86_400_000

CRISIS = re.compile(
    r"\b(hack(ed|er|ers)?|exploit(ed)?|drain(ed)?|stolen|insolven\w*|bankrupt\w*|collapse[sd]?|"
    r"depeg(ged|s)?|de-peg\w*|(halts?|suspends?|freezes?|pauses?) withdrawals?|ponzi|"
    r"crash(es|ed)? \d+%|plunges? \d+%|liquidations? (top|hit|surge)\w*)\b",
    re.IGNORECASE,
)


def load() -> dict[str, list[str]]:
    """{day_start_ms (as str): [headlines that triggered it]}."""
    return json.loads(BRAKE_FILE.read_text()) if BRAKE_FILE.exists() else {}


def brake_days() -> set[int]:
    return {int(k) for k in load()}


def check() -> dict:
    """Scan the latest headlines. If the brake triggers, record today (UTC day) as a no-buy day."""
    try:
        items = asyncio.run(get_news(limit_per_source=30))
    except Exception:
        items = []
    cutoff = time.time() - 86_400
    hits = []
    for n in items:
        pub = n.get("published")
        if pub and datetime.fromisoformat(pub).timestamp() >= cutoff and CRISIS.search(n["title"]):
            hits.append(n["title"])
    today = int(time.time() * 1000) // DAY_MS * DAY_MS
    days = load()
    if len(hits) >= MIN_HEADLINES and str(today) not in days:
        days[str(today)] = hits[:5]
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        BRAKE_FILE.write_text(json.dumps(days, indent=1))
    on = str(today) in days
    return {"on": on, "headlines": days.get(str(today), hits[:5]), "crisis_headlines_24h": len(hits)}
