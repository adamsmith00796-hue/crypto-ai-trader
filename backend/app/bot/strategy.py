"""The six-dot rules, computed per coin on closed daily candles.

These are the exact rules that were backtested (Jan 2021 onwards, 0.15% cost per side):

  1 Trend       close above its 100-day average
  2 Momentum    higher than 28 days ago
  3 Breakout    in the upper half of at least 2 of its 20/55/100-day ranges
  4 Weekly      last completed week closed above its 20-week average
  5 Big coin    one of the 10 most-traded coins (30-day dollar volume) that day
  6 Calm        daily price swing (ATR %) not in its top 10% of the past year

Buy when all six are green. Sell when 2 of dots 1-3 turn red, or when the trailing
stop (3 x ATR below the highest close since entry) is hit.
"""

from __future__ import annotations

WARMUP_DAYS = 365
TOP_N = 10

DOTS = [
    ("trend", "Trend", "Price above its 100-day average"),
    ("momentum", "Momentum", "Higher than 28 days ago"),
    ("breakout", "Breakout", "Upper half of its 20/55/100-day ranges"),
    ("weekly", "Weekly", "Weekly close above its 20-week average"),
    ("big", "Big coin", "One of the 10 most-traded coins"),
    ("calm", "Calm", "Price swings not extreme"),
]


def _atr(rows: list[list[float]]) -> list[float]:
    out: list[float] = []
    a = None
    for i, r in enumerate(rows):
        tr = r[2] - r[3] if i == 0 else max(r[2] - r[3], abs(r[2] - rows[i - 1][4]), abs(r[3] - rows[i - 1][4]))
        a = tr if a is None else a + (tr - a) / 14
        out.append(a)
    return out


def coin_signals(rows: list[list[float]]) -> list[dict | None]:
    """Per-day dots for one coin. rows = [open_time, open, high, low, close, quote_volume].

    Returns one entry per row (None during the one-year warm-up). The "big coin" dot is
    filled in later by the engine, because it depends on the other coins.
    """
    cl = [r[4] for r in rows]
    vol = [r[5] for r in rows]
    atr = _atr(rows)
    atrp = [a / p for a, p in zip(atr, cl)]
    weekly = [cl[i] for i in range(6, len(cl), 7)]
    out: list[dict | None] = []
    for i in range(len(rows)):
        vol30 = sum(vol[max(0, i - 29):i + 1]) / min(30, i + 1)
        if i < WARMUP_DAYS:
            out.append(None)
            continue
        trend = cl[i] > sum(cl[i - 99:i + 1]) / 100
        momentum = cl[i] > cl[i - 28]
        halves = 0
        for n in (20, 55, 100):
            window = rows[i - n + 1:i + 1]
            hi, lo = max(r[2] for r in window), min(r[3] for r in window)
            halves += cl[i] > (hi + lo) / 2
        breakout = halves >= 2
        j = (i + 1) // 7 - 1
        weekly_up = j >= 20 and weekly[j] > sum(weekly[j - 19:j + 1]) / 20
        past = sorted(atrp[i - 364:i + 1])
        calm = atrp[i] <= past[int(0.9 * len(past)) - 1]
        rets = [cl[k] / cl[k - 1] - 1 for k in range(i - 59, i + 1)]
        m = sum(rets) / 60
        sd = (sum((x - m) ** 2 for x in rets) / 60) ** 0.5 or 1
        out.append({
            "trend": trend, "momentum": momentum, "breakout": breakout,
            "weekly": weekly_up, "calm": calm, "big": False,
            "atr": atr[i], "vol30": vol30,
            "strength": (cl[i] / cl[i - 60] - 1) / sd,  # 60-day return per unit of volatility
        })
    return out


def all_green(s: dict) -> bool:
    return all(s[k] for k, _, _ in DOTS)


def trend_broken(s: dict) -> bool:
    return (not s["trend"]) + (not s["momentum"]) + (not s["breakout"]) >= 2
