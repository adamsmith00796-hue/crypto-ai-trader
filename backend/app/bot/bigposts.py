"""Telegram alert when Trump posts about crypto (alert only, never traded).

Truth Social itself blocks servers, so posts come from the public trumpstruth.org RSS archive, checked
every refresh (5 minutes). A post counts when it mentions crypto, a big coin by name, or a $TICKER.
Posts are data: only their text is quoted, as plain text. Each post is alerted once (alerts_sent.json),
and only if it is under MAX_AGE_H hours old, so a restart never replays old posts.

Why alert only: tested history (2025 "crypto reserve" post, TRUMP coin) shows the jump happens within
seconds and mostly fades within days, so chasing it loses. It's context for the breakout alerts.
"""

from __future__ import annotations

import html
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime

import httpx

from . import alerts

FEED = "https://www.trumpstruth.org/feed"
NS = "{https://truthsocial.com/ns}"
MAX_AGE_H = 3
COINS = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "xrp": "XRP", "ripple": "XRP", "cardano": "ADA",
         "dogecoin": "DOGE", "chainlink": "LINK", "litecoin": "LTC", "sui": "SUI", "hedera": "HBAR"}
CRYPTO = re.compile(r"\b(crypto\w*|bitcoin|ethereum|solana|xrp|ripple|cardano|dogecoin|stablecoins?|blockchain|"
                    r"digital assets?|meme ?coins?|coinbase|binance|world liberty|wlfi|usd1|defi|btc|eth)\b"
                    r"|\$[A-Z]{2,10}\b", re.IGNORECASE)
TICKERS = re.compile(r"\b(BTC|ETH|SOL|XRP|ADA|BNB|AVAX|HBAR|SUI|LTC|TRX|XLM)\b")  # capitals only: "sol", "link" are words
log = logging.getLogger(__name__)


def _text(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))).strip()


def recent_crypto_posts() -> list[dict]:
    r = httpx.get(FEED, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    r.raise_for_status()
    out = []
    for item in ET.fromstring(r.text).findall("./channel/item"):
        text = _text(item.findtext("description") or item.findtext("title") or "")
        when = parsedate_to_datetime(item.findtext("pubDate"))
        if when.tzinfo is None:  # "-0000" dates come back without a timezone: they are UTC
            when = when.replace(tzinfo=timezone.utc)
        if not text or time.time() - when.timestamp() > MAX_AGE_H * 3600 or not (CRYPTO.search(text) or TICKERS.search(text)):
            continue
        coins = {COINS[w.lower()] for w in re.findall(r"[A-Za-z]+", text) if w.lower() in COINS}
        coins |= {m[1:].upper() for m in re.findall(r"\$[A-Za-z]{2,10}\b", text)} | set(TICKERS.findall(text))
        out.append({"id": item.findtext(f"{NS}originalId") or item.findtext("guid"), "text": text, "when": when,
                    "url": item.findtext(f"{NS}originalUrl") or item.findtext("link"), "coins": sorted(coins)})
    return out


def notify(live: dict) -> None:
    try:
        posts = recent_crypto_posts()
    except (httpx.HTTPError, ET.ParseError, TypeError, ValueError) as e:
        log.warning("Trump posts feed failed: %s", type(e).__name__)
        return
    sent = set(json.loads(alerts.SENT_FILE.read_text())) if alerts.SENT_FILE.exists() else set()
    for p in posts:
        key = f"post:{p['id']}"
        if key in sent:
            continue
        local = p["when"].astimezone(alerts.LOCAL_TZ)
        quote = p["text"] if len(p["text"]) <= 400 else p["text"][:400].rsplit(" ", 1)[0] + "…"
        prices = [f"{c} {alerts._money(live[c][4])} ({(live[c][4] / live[c][1] - 1) * 100:+.1f}% today)"
                  for c in p["coins"] if c in live]
        text = (f"🗣️ TRUMP POST about crypto ({local.strftime('%-I:%M%p').lower()} {local.strftime('%a')})\n"
                f"\"{quote}\"\n"
                + (f"Now: {', '.join(prices)}\n" if prices else "")
                + f"{p['url']}\n"
                "News spikes like this usually fade within days, so don't chase it. "
                "A breakout alert on the same coin is the stronger signal.")
        if alerts.send(text, shared=True):
            sent = set(json.loads(alerts.SENT_FILE.read_text())) if alerts.SENT_FILE.exists() else set()
            sent.add(key)
            alerts.SENT_FILE.write_text(json.dumps(sorted(sent)))
