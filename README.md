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

None of this is wired up yet — it needs credentials from you before it
can be built, and each provider is its own scoped decision.

## Notes

- Always-dark theme by design (not a partial dark-mode toggle) —
  matches the dense "trading terminal" aesthetic this was modeled on.
- Colors follow a validated accessible palette (categorical hue order,
  status colors reserved and never reused, delta indicators always
  paired with an icon/label, not color alone).
- This is an information dashboard. It does not place trades and holds
  no exchange write-access credentials.
