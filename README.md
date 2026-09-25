# Six-Dot Bot

A self-running crypto trading bot, currently **paper trading** (pretend money, no exchange
connected). It watches the market every 5 minutes, makes one buy/sell decision a day, and
sends a Telegram message on every buy and sell.

Built with a FastAPI backend (the bot) and a Next.js 14 dashboard, dark "terminal" theme.

## How it trades

Six checks ("dots") per coin, worked out on finished daily candles (the day closes at 10am AEST).
**It buys only when all six are green:**

| Dot | Green when |
|---|---|
| Trend | Price is above its 100-day average |
| Momentum | Price is higher than 28 days ago |
| Breakout | Price is in the upper half of at least 2 of its 20/55/100-day ranges |
| Weekly | Last week's close is above its 20-week average |
| Big coin | It's one of the 10 most-traded coins |
| Calm | Its daily swings aren't in their wildest 10% of the past year |

**It sells** when 2 of Trend, Momentum and Breakout turn red, or when a day **closes** below its
trailing stop (3 x ATR below the highest close since buying, only ever moves up).

**Money:** $200, split 50% Bitcoin, 50% across the 3 strongest top coins that Hyperliquid lists
for spot trading. Spot only: no leverage, no shorting.

## Track record (same rules on past prices)

Since 1 Jan 2021, $200 start, 0.12% fees and slippage per trade (Hyperliquid spot):

| | $200 became | Worst drop |
|---|---|---|
| Six-dot bot | about $1,900 | 37% |
| Just hold Bitcoin | about $580 | 77% |
| Bitcoin 200-day rule | about $560 | 64% |

Settings were chosen on 2021 to 2023 and checked on 2024 onwards, which they never saw.
Past prices are not a promise of future returns.

**Tested and rejected** (they lost money on the unseen years): 2x/3x leverage, short selling,
Hyperliquid perps (about 14%/yr funding cost), 1-hour and 4-hour versions, chasing the hottest
of 70+ coins, and Krown's Cross / pullback setups (fees eat them).
See `reports/` and `research_notes/` for the research and test results.

## Safeguards

- **Safety switch:** if the account falls 40% below its peak, it sells everything and stops.
- **Health check:** ON TRACK / WATCH / WARNING / STOPPED, re-checked every refresh.
- **News brake (untested):** skips new buys for the day when 2+ crisis headlines (hacks,
  collapses, frozen withdrawals) appear in 24 hours. Never forces a sale.
- **Tax log:** every closed trade as a CSV, from the dashboard (USD).
- **Telegram alerts:** buy and sell messages only.

## Code map

- `backend/app/bot/strategy.py`, the six dots
- `backend/app/bot/engine.py`, trading rules, sizing, stops, safety switch (same code for the
  track record and the paper account, so they always match)
- `backend/app/bot/data.py`, daily candles (Binance public data, plus Hyperliquid for HYPE)
- `backend/app/bot/service.py`, refresh loop, paper account, health check, tax log
- `backend/app/bot/alerts.py`, Telegram buy/sell messages
- `backend/app/bot/news_brake.py`, crisis-headline brake
- `frontend/src/app/page.tsx`, the dashboard

## Running locally

```bash
# Backend (the bot)
cd backend
python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --port 8000

# Frontend (separate terminal)
cd frontend
npm install && npm run dev
# open http://localhost:3000
```

The first start downloads price history (about a minute). Paper-trading state lives in
`backend/data/` (gitignored). Telegram alerts need `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
in `backend/.env` (gitignored, never committed).

The backend also still has read-only portfolio endpoints (Coinbase, CoinSpot, Swyftx, behind
view-only keys in `.env`); the dashboard no longer shows them.

## Roadmap: live trading on Hyperliquid (future, real money)

Goal: once paper trading has cleared the gates below, run the bot on a small server and connect
it to a **non-custodial wallet on Hyperliquid** (a wallet-based exchange). The wallet gets funded,
the bot trades spot, proceeds come back to the same wallet.

**Not started. No real orders are placed anywhere in this code.**

Gates before real money (from `reports/Crypto trading bot build research.md`):
1. Clean backtest: closed candles, realistic fees. Done; formal lookahead checks not yet run.
2. Beats buy-and-hold and the 200-day rule after fees, every variant logged. Done.
3. Test on data never tuned on. Done (2021-23 tuned, 2024+ checked).
4. 4 to 8 weeks and 30+ trades of paper trading. **In progress, started 24 Sep 2026.**
5. Then the smallest position size on real money, scaling up only if live results track the
   backtest.

Live setup rules: Hyperliquid trade-only API wallet (cannot withdraw), keys only on the server,
treat the funded amount as money you can afford to lose.
