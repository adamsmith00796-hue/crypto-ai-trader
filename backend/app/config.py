"""Shared access to the holdings config (config/portfolio.json, else the example)."""

from __future__ import annotations

import json
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"
REAL_CONFIG = CONFIG_DIR / "portfolio.json"
EXAMPLE_CONFIG = CONFIG_DIR / "portfolio.example.json"


def load_holdings() -> list[dict]:
    path = REAL_CONFIG if REAL_CONFIG.exists() else EXAMPLE_CONFIG
    with open(path) as f:
        return json.load(f)["holdings"]


def held_coin_ids() -> list[str]:
    """CoinGecko ids of the coins you hold, de-duplicated, in file order."""
    seen: list[str] = []
    for h in load_holdings():
        if h["coingecko_id"] not in seen:
            seen.append(h["coingecko_id"])
    return seen


def load_settings() -> dict:
    """Top-level settings from the config file (currently just the gain-alert threshold, %)."""
    path = REAL_CONFIG if REAL_CONFIG.exists() else EXAMPLE_CONFIG
    with open(path) as f:
        data = json.load(f)
    return {"alert_gain_pct": float(data.get("alert_gain_pct", 200))}
