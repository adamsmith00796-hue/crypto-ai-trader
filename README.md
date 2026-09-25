# Crypto Info Hub

A live crypto information dashboard — portfolio value, market prices, a
fear/greed sentiment gauge, trending coins, and news. No trading, no
execution — this is purely informational.

Built with a FastAPI backend and a Next.js 14 dashboard, dark "terminal"
theme throughout.

## What it shows

- **Portfolio** — total value and per-holding breakdown, priced live.
- **Market** — price, 24h change, and a 7-day sparkline for a watchlist
  of coins (CoinGecko, free/no key).
- **Sentiment** — the Crypto Fear & Greed Index, with a 7-day trend
  (alternative.me, free/no key).
- **Trending** — coins currently trending on CoinGecko search.
- **News** — latest headlines from CoinDesk and Cointelegraph RSS.

## Running locally

```bash
# Backend
cd backend
python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --port 8000

# Frontend (separate terminal)
cd frontend
npm install && npm run dev
# open http://localhost:3000
```

The frontend proxies `/api/*` to the backend at `http://localhost:8000`
in dev (see `frontend/next.config.mjs`). Set `BACKEND_URL` to point it
elsewhere in production.

## Your portfolio data

Real holdings are **not** committed to this repo — same pattern as the
`crypto-tax-tracker` project: `config/portfolio.json` is gitignored.
Copy the example and fill in your own:

```bash
cp config/portfolio.example.json config/portfolio.json
```

Each entry is a manual holding (label, source, symbol, CoinGecko id,
quantity) — the backend prices it live, you don't do the math. This
replaces typing numbers into CoinMarketCap by hand, but it's still
manual entry for now (see Roadmap).

## Roadmap — automated balance fetching

Right now `config/portfolio.json` is hand-maintained. The next step is
pulling balances automatically instead of typing them in:

- **On-chain wallets** (MetaMask etc.) — read ERC-20/native balances
  directly from an address via a provider like Etherscan or Alchemy
  (needs a free API key from whichever provider you pick).
- **CoinSpot / Swyftx** — both have authenticated REST APIs for
  account balances (needs an API key + secret from your exchange
  account, read-only scope).
- **Koinly** — deliberately not on this list. Koinly has no public API
  (open feature request since 2021); the only path is CSV export, which
  is what `crypto-tax-tracker` already handles for tax purposes.

Coinbase, CoinSpot and Swyftx read-only balance fetching are already
built (`backend/app/coinbase.py`, `coinspot.py`, `swyftx.py`), each
gated behind view-only API keys in `.env`. On-chain wallet reads are
the remaining gap.

## Roadmap — live trading on Hyperliquid (future, real money)

Longer-term goal, discussed 25 Sep 2026: once the paper-trading bot
(`backend/app/bot/`) has been walk-forward validated and cleared the
gates below, deploy this to the web and connect it to a real,
**non-custodial cold-storage wallet on Hyperliquid** (a decentralized
exchange — wallet-based by design, no KYC layer to bypass, this is just
how Hyperliquid works). The wallet gets funded, the bot trades it live,
proceeds come back to the same wallet.

**Not started. Nothing here is built.** This is a placeholder so the
plan survives between sessions — it is not a signal to start wiring up
live trading now.

Before any of this happens, per `reports/Crypto trading bot build
research.md`'s own validation framework:
1. Clean backtest (closed candles, realistic fees/slippage, lookahead
   checks) — the six-dot backtest exists; formal lookahead/recursive
   checks have not been run.
2. Beats both buy-and-hold and the 200-day rule after fees, stable
   under ±20-30% parameter perturbation, every variant tried logged.
   (See the 25 Sep 2026 ablation: dropping the "calm" volatility dot,
   gated or as a size multiplier, underperformed the current six-dot
   design on return, drawdown, and return/drawdown ratio — six dots
   confirmed better than four in that single backtest window, but not
   yet walk-forward validated.)
3. Walk-forward / rolling-window testing on data never tuned on.
4. 4-8 weeks and 30-50+ trades of paper trading, live signals matching
   a fresh backtest ≥95% of the time.
5. Only then: smallest position size on real capital, scale up only
   after each ~30 live trades stay within the backtest's expected
   range. Kill switch: drawdown beyond 1.5× the backtest's max
   drawdown, or underperforming the 200-day rule over any 6 months.

API key permissions: trade-only, withdrawals off, IP-locked, in a
wallet/sub-account holding only the bot's money. Treat the funded
amount as capital you can afford to lose — `reports/` is explicit that
even a well-built bot's realistic outcome is crash protection, not
income.

## Notes

- Always-dark theme by design (not a partial dark-mode toggle) —
  matches the dense "trading terminal" aesthetic this was modeled on.
- Colors follow a validated accessible palette (categorical hue order,
  status colors reserved and never reused, delta indicators always
  paired with an icon/label, not color alone).
- This is an information dashboard. It does not place trades and holds
  no exchange write-access credentials.
