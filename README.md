# Six-Dot Bot

A self-running crypto trend-following bot that trades **real money on Hyperliquid spot**: no
leverage, no shorting, 24/7 on a small cloud server, with a phone-friendly dashboard and Telegram
alerts.

Its main idea isn't a secret indicator. It's **discipline about testing**: every rule was chosen on
2021-23 prices and only kept if it also worked on 2024-26 prices it never saw. Most ideas failed
that test, and the [list of rejected ideas](#tested-and-rejected) is half the value of this repo.

> Not financial advice. Past results are not a promise of future returns. Only trade money you can
> afford to lose.

## How it trades

Once a day, on the finished daily candle (00:00 UTC), it checks the 10 coins Hyperliquid lists
for spot trading (BTC, ETH, SOL, ZEC, NEAR, HYPE, ENA, PUMP, XPL, PENGU).

**It buys a coin when five dots are green:**

| Dot | Green when |
|---|---|
| Trend | Price is above its 100-day average |
| Momentum | Price is higher than 28 days ago |
| Breakout | Price is in the upper half of at least 2 of its 20/55/100-day ranges |
| Weekly | Last week's close is above its 20-week average |
| Big coin | It's one of the 10 most-traded coins (30-day volume) that day |

**...and only while the market weather is good:** Bitcoin closes above its 200-day average.
Below that line, no new buys at all.

**Money:** 30% Bitcoin core, 70% split across up to 3 other green coins (strongest first).

**It sells when:**
- 2 of Trend, Momentum and Breakout turn red, or
- a day closes below its trailing stop (2.5 x ATR below the highest close since buying), or
- a disaster stop is hit intraday (the price crashes 20% below the trailing stop).

## Track record (same rules on past prices)

1 Jan 2021 to 17 Oct 2026, $1,000 start, 0.12% fees and slippage per trade:

| | $1,000 became | Worst drop |
|---|---|---|
| **Six-Dot Bot** | **about $15,100** | **26%** |
| Just hold Bitcoin | about $2,800 | 77% |
| Bitcoin 200-day rule | about $2,700 | 64% |

| Year | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (to Oct) |
|---|---|---|---|---|---|---|
| Bot | +164% | 0% | +98% | +45% | +26% | +58% |

144 trades, 48% winners: it loses small often and wins big occasionally. Coin list is today's,
so coins that collapsed before being listed are missing (survivorship bias); treat the numbers as
optimistic.

## Live results (honest)

Live since 27 Sep 2026 with about US$700. As of 18 Oct 2026 it's **down about 12%**, during a
falling, choppy market where the backtest itself is down about 18% over the same weeks. Trend
following makes its money in a few strong runs and gives some back in between.

## Tested and rejected

Each of these was tested the same way (chosen on 2021-23, checked on unseen 2024-26) and did
worse than the rules above:

- **Short selling** (six red dots to short): $1,000 to $559 on its own; any mix lowered returns.
- **Leverage** (2x/3x) and **perps** (funding costs about 14%/yr).
- **Small-coin breakouts ("moonshots")**: +1,272% in the 2021-23 mania, -63% to -79% since 2024.
- **Buying earlier** (intraday breakout pace): no better price, more false starts.
- **Tighter "quick profit" exits** (sell 10-15% off the peak): sold winners too early.
- **Weekly momentum rotation** and **RSI(2) dip-buying**.
- **Ensemble Donchian with volatility sizing** (Zarattini, Pagani & Barbon, 2025).
- **Fewer or more dots**: 3-4 dots meant more trades and bigger drops; 6 (with a "Calm" filter) was worse than 5.
- **freqtrade-style protections** (cooldowns, stop-loss guards).
- **Kronos** (Tsinghua's financial foundation model) as a coin picker: worse than chance out of sample.
- **Funding-rate crowding filters**: skipped the best runs.
- **A paid newsletter's trade calls**: 1 winner in 8.

See `research_notes/` and `reports/` for details.

## Safeguards

- **Trade-only key:** a Hyperliquid API ("agent") wallet that can trade but **cannot withdraw**.
- **Safety switch:** if the account falls 40% below its peak, it sells everything and stops.
- **News brake:** no new buys on days with 2+ crisis headlines (hacks, collapses, frozen withdrawals).
- **Wrong-wallet guard:** refuses to trade an account worth more than a set limit.
- **Order rules:** never repeats the same coin and side on the same day; ignores tiny differences
  so price drift doesn't burn fees; tops up when idle cash builds up.
- **Health check:** ON TRACK / WATCH / WARNING / STOPPED, compared with the backtest.

## Alerts (Telegram)

- Every real buy and sell, and any failed order.
- Crypto posts by Donald Trump (alert only, never traded).
- Optional: price alerts when your own long-term coins return to your average buy price.

## Code map

- `backend/app/bot/strategy.py`: the dots and the buy and sell signals
- `backend/app/bot/engine.py`: sizing, stops, market-weather filter, safety switch (the same code
  runs the backtest and the live targets, so they always match)
- `backend/app/bot/live.py`: Hyperliquid execution (makes the real account hold what the rules hold)
- `backend/app/bot/data.py`: daily candles (Binance public data, Hyperliquid for HYPE)
- `backend/app/bot/service.py`: refresh loop, health check, dashboard data, trade log
- `backend/app/bot/alerts.py`, `bigposts.py`, `holdings_watch.py`, `news_brake.py`: alerts and the brake
- `frontend/src/app/page.tsx`: the dashboard (Next.js)

## Running it

```bash
# Backend (the bot)
cd backend
python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --port 8000

# Dashboard (separate terminal)
cd frontend
npm install && npm run dev   # http://localhost:3000
```

The first start downloads price history (about a minute). Settings go in `backend/.env`
(gitignored, never commit it):

```bash
TELEGRAM_BOT_TOKEN=...        # optional, for alerts
TELEGRAM_CHAT_ID=...
HL_MODE=dry-run               # off | dry-run | testnet | live
HL_ACCOUNT_ADDRESS=0x...      # your main Hyperliquid wallet (public address)
HL_API_PRIVATE_KEY=...        # an API (agent) wallet key: can trade, cannot withdraw
```

Start with `HL_MODE=dry-run`: it shows the orders it would place without placing any.
`python -m app.bot.live` prints the same thing once.
