# Crypto trading bot build: frameworks, exchanges, API security, operations

Research date: 24 Sep 2026. GitHub/PyPI figures were pulled live from the GitHub REST API (`api.github.com/repos/<repo>`) and PyPI JSON API on 24 Sep 2026. Where a claim is my own knowledge and not verified this session, it is marked "(unverified)" or placed under Inferences/Gaps.

## 1. Framework comparison (Freqtrade, Jesse, Hummingbot, OctoBot, NautilusTrader, backtrader/vectorbt, CCXT, webhook services)

### Takeaway
Freqtrade is the clear fit: Python, GPL-3.0, free, most-starred bot framework (54.7k stars), monthly releases (2026.8 on 31 Aug 2026), built-in lookahead-bias checker, hyperopt, dry-run, Telegram, and a documented REST API + WebSocket that a FastAPI/Next.js dashboard can call. Jesse has cleaner backtesting ergonomics but live trading is a paid plugin (~US$1,600 list). Hummingbot and NautilusTrader are built for market-making / professional low-latency work and are overkill for a 1h-daily indicator strategy.

### Cited Findings

Live repo stats (GitHub API, 24 Sep 2026):

| Project | Language | Stars | Last push | Latest release | Open issues+PRs | Licence |
|---|---|---|---|---|---|---|
| Freqtrade | Python | 54,737 | 2026-09-24 | 2026.8 (2026-08-31) | 29 | GPL-3.0 |
| CCXT | JS/Python/PHP/etc | 44,130 | 2026-09-23 | v4.5.83 (2026-09-23) | 704 | MIT |
| NautilusTrader | Rust core + Python API | 29,328 | 2026-09-24 | v1.231.0 (2026-08-02) | 137 | LGPL-3.0 |
| backtrader | Python | 23,314 | **2024-08-19** | none published | 63 | GPL-3.0 |
| Hummingbot | Python (Cython) | 20,182 | 2026-09-23 | v2.17.0 (2026-09-22) | 172 | Apache-2.0 |
| vectorbt (open-source) | Python | 9,167 | 2026-09-17 | v1.1.0 (2026-07-05) | 141 | "NOASSERTION" (custom: Apache-2.0 + Commons Clause, unverified) |
| Jesse | Python | 8,576 | 2026-09-23 | PyPI 3.2.2 (2026-09-23) | 16 | MIT |
| OctoBot | Python | 6,608 | 2026-09-23 | 3.0.0-beta2 (2026-08-06); PyPI stable 2.1.1 (2026-03-29) | 168 | GPL-3.0 |

Sources: [GitHub freqtrade](https://github.com/freqtrade/freqtrade), [GitHub ccxt](https://github.com/ccxt/ccxt), [GitHub nautilus_trader](https://github.com/nautechsystems/nautilus_trader), [GitHub backtrader](https://github.com/mementum/backtrader), [GitHub hummingbot](https://github.com/hummingbot/hummingbot), [GitHub vectorbt](https://github.com/polakowo/vectorbt), [GitHub jesse](https://github.com/jesse-ai/jesse), [GitHub OctoBot](https://github.com/Drakkar-Software/OctoBot), [PyPI](https://pypi.org/)

Freqtrade specifics:
- REST API enabled via `api_server` config block, listens on 127.0.0.1:8080 by default; endpoints include `/start`, `/stop`, `/pause`, `/stopbuy`, `/trades`, `/trade/<id>`, `/forceenter`, `/forceexit`, `/profit`, `/daily`/`/weekly`/`/monthly`, `/status`, `/balance`, `/pair_candles`, `/pair_history` — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- Auth is Basic Auth or JWT (`/token/login`, 15-minute tokens, `/token/refresh`); WebSocket at `/message/ws` pushes entry/exit fills and other RPC messages; optional Swagger UI at `/docs` with `enable_openapi` — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- The same API powers FreqUI (Freqtrade's own web UI); docs "strongly recommend to not expose this API to the internet", use SSH tunnel/VPN — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- `lookahead-analysis` command chains backtests to provoke and detect lookahead bias (e.g. `shift(-n)`, full-column `.mean()`, direct dataframe indexing); a separate `recursive-analysis` tool exists for indicator warm-up/recursion issues — [Freqtrade lookahead-analysis docs](https://www.freqtrade.io/en/stable/lookahead-analysis/)

Jesse specifics:
- Live trading requires the paid "live trade" plugin: one-time lifetime licence, list price US$1,600, discounted to US$640 in past Black Friday sales — [Jesse blog: Black Friday sale](https://jesse.trade/blog/news/black-friday-sale-for-the-premium-live-trade-plugin); [Jesse FAQ: why pay for live](https://jesse.trade/help/faq/why-do-i-have-to-pay-for-live-i-thought-its-open-source)
- Licence limits concurrent sessions by IP to 2 (one dev, one production) — [Jesse Terms of Service](https://jesse.trade/terms-of-service)
- (jesse.trade/pricing returned HTTP 403 to the fetcher so current 2026 price could not be confirmed directly.)

Webhook services (TradingView alert -> exchange):
- TradersPost from US$49/month, 7-day paper-trading trial, 20+ brokers across stocks/options/futures/crypto — [TradersPost comparison page](https://traderspost.io/compare/traderspost-vs-3commas) (vendor source)
- WunderTrading has a free tier and paid tiers starting around US$10/month, marketplace/copy-trading focus — [cryptoadventure comparison](https://cryptoadventure.com/trading-bots-wars-3commas-vs-wundertrading-vs-coinrule-vs-tradesanta/); [xcryptobot 2026 comparison](https://xcryptobot.com/blog/3commas-vs-wundertrading-2026) (low-weight aggregators)
- 3Commas centred on webhook execution, multi-take-profit, multi-account routing — [cryptoadventure comparison](https://cryptoadventure.com/trading-bots-wars-3commas-vs-wundertrading-vs-coinrule-vs-tradesanta/) (low weight; pricing figures in these aggregators conflict)

### Inferences
Feature matrix (from cited docs above plus my prior knowledge of each project; items not verified this session are marked *):

| | Backtest quality | Hyperopt | Walk-forward | Paper/dry-run | Live reliability | Dashboard API | Cost |
|---|---|---|---|---|---|---|---|
| **Freqtrade** | Candle-based, fees configurable*, lookahead + recursive analysis tools (cited) | Yes, Optuna-based hyperopt with pluggable loss functions* | Not native; done by scripting timeranges* | Yes, dry-run* | Mature, huge user base | REST + WS + JWT (cited) | Free |
| **Jesse** | Strong: explicit multi-timeframe with no-lookahead candle design, fee modelling* | Yes (Optuna*) | Not native* | Paper trading via paid plugin* | Good, smaller user base | Built-in GUI; its own API is not a documented public contract* | Backtest free, live ~US$1,600 (cited) |
| **Hummingbot** | Limited for directional strategies; built around market-making/arb* | Limited | No | Paper exchange connectors* | Good for MM | Hummingbot API/Dashboard (separate repos)* | Free |
| **OctoBot** | Basic | Basic | No | Yes* | Mixed; 3.0 still in beta (cited) | Own web UI; cloud offering* | Free self-hosted, paid cloud* |
| **NautilusTrader** | Excellent: event-driven, same code backtest/live, realistic fills* | Bring your own | Bring your own | Sandbox mode* | Institutional grade | No turnkey dashboard API; you'd build it | Free, but steep learning curve |
| **backtrader** | OK but unmaintained since Aug 2024 (cited push date) | Basic | No | Via broker adapters | Not recommended for crypto live | None | Free |
| **vectorbt** | Very fast vectorised research; easy to introduce lookahead if careless* | Grid/param sweeps | Supports rolling splits (walk-forward style)* | No | Research only (no live) | None | OSS free; PRO paid* |
| **CCXT DIY** | None (you build it) | You build | You build | Exchange testnets | Depends on you | You build | Free, but most dev effort |
| **Webhook SaaS** | Relies on TradingView strategy tester (bar-close fills, repainting risk*) | TradingView manual | No | Some offer paper* | Depends on 3rd party uptime | Vendor dashboards, limited API | US$10-50+/month plus a paid TradingView plan for webhooks* |

- For a non-technical owner with a FastAPI + Next.js dashboard already, Freqtrade is the lowest-maintenance route: run Freqtrade as its own process (Docker), and have FastAPI proxy its REST API (keeping JWT secret server-side) so Next.js never talks to the bot directly.
- A US$1,600 Jesse licence would be ~8x the entire ~US$200 trading account, which rules it out on economics alone.
- vectorbt is a good complementary research tool for fast parameter sweeps / walk-forward style testing, but not the runtime bot.
- Webhook SaaS adds a monthly fee that is 5-25% of a US$200 account per month, making them hard to justify on this capital; they also add third-party custody of API keys.

### Gaps
- Could not fetch Jesse's current pricing page (403) or docs index (404); 2026 price unconfirmed.
- Freqtrade fee modelling and hyperopt loss-function details were not in the fetched doc page; asserted from prior knowledge.
- No authoritative source found this session on Discord/Telegram community sizes; stars used as proxy.
- PineConnector was not researched (it is primarily MetaTrader/forex-focused per prior knowledge, unverified).
- Webhook-service pricing across aggregator articles is inconsistent; verify on vendor pricing pages before choosing.

## 2. Best choice for an indicator-confluence strategy on 1h-daily candles, 24/7 on Mac or cheap VPS, ~US$200 account

### Takeaway
Freqtrade on spot BTC/USDT (or BTC/AUD), started in dry-run, is the best fit. The timeframe is slow enough that latency is irrelevant, the strategy style (populate_indicators / entry / exit signals) matches Freqtrade's model exactly, and its REST API slots into the existing dashboard.

### Cited Findings
- Freqtrade exposes status/profit/trades/force-exit and candle data over REST plus a WebSocket feed of fills, which covers what a custom dashboard needs — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- Freqtrade ships a lookahead-bias detector, the most common way indicator-confluence backtests lie — [Freqtrade lookahead-analysis docs](https://www.freqtrade.io/en/stable/lookahead-analysis/)
- Freqtrade released 2026.8 on 31 Aug 2026 and had commits on 24 Sep 2026, i.e. actively maintained — [GitHub freqtrade](https://github.com/freqtrade/freqtrade)

### Inferences
- Minimum-order constraints matter at US$200: most exchanges have ~US$5-10 minimum notional for BTC spot (unverified per exchange), so the bot should use at most 2-4 concurrent positions, or just one BTC position sized at e.g. 90% of balance.
- Fees dominate small accounts: a 0.1% taker fee per side on Binance-style venues vs 0.5-0.85% on AU brokers (see section 3) can be the difference between a profitable and unprofitable backtest; backtest with the actual venue's fee.
- Spot only is recommended for a US$200, non-technical setup: no liquidation risk, and avoids Australian retail-derivative regulatory issues (section 3).
- Hyperopt on a small number of trades (1h-daily yields few trades per year) overfits easily; use an out-of-sample holdout / manual walk-forward via timerange splits.

### Gaps
- No independent benchmarks comparing live vs backtest slippage for Freqtrade at this timeframe were found.

## 3. Exchange choice for an Australian resident (and Thailand)

### Takeaway
For spot BTC with a bot, Kraken (AUD on-ramp, AUSTRAC-registered via Bit Trade, mature API, CCXT/Freqtrade-supported) or Binance Australia spot are the practical picks; BTC Markets and Independent Reserve have APIs and AUD but higher entry fees and weaker Freqtrade support. Perpetuals for Australian retail are a regulatory minefield: ASIC has penalised both Binance Australia Derivatives (A$10m, Mar 2026) and Kraken's Bit Trade (A$8m, Dec 2024), so stick to spot. In Thailand, Bybit and OKX are blocked by the Thai SEC since 28 Jun 2025.

### Cited Findings
Australia:
- Federal Court ordered Oztures Trading (Binance Australia Derivatives) to pay a A$10m penalty for misclassifying >85% of its Australian clients (524 retail investors) as wholesale, exposing them to crypto derivatives; >A$12m in losses and fees, Jul 2022-Apr 2023 — [ASIC media release 26-055MR](https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-055mr-binance-australia-derivatives-ordered-to-pay-10-million-penalty-for-onboarding-failures-causing-millions-in-client-trading-losses)
- Binance requested cancellation of its Australian Financial Services licence in 2023; article dated 27 Mar 2026 — [Finance Magnates](https://www.financemagnates.com/cryptocurrency/binance-fined-aud10-million-in-australia-as-crypto-perp-rules-tighten/). Note: the article says "Binance no longer operates in Australia", which appears to refer to the derivatives arm only; Binance Australia spot status was not verified this session.
- Bit Trade (Kraken's Australian operator) fined A$8m in Dec 2024 for a "margin extension" product offered to >1,100 Australian clients without a Target Market Determination; clients lost A$7.85m — [Decrypt](https://decrypt.co/296194/kraken-australia-fined-high-risk-margin-trading-products); [Lavan](https://www.lavan.com.au/publications/asic-takes-down-krakens-cryptic-crypto-credit-facility/)
- ASIC has issued public warnings involving Binance, Bybit and Bitget regarding retail derivatives access — [Bitget Academy](https://www.bitget.com/academy/bybit-regulation-202) (competitor source, low weight)
- Bybit's AUSTRAC registration status is reported inconsistently: one source lists AUSTRAC among its registrations, another says it lacks it — [Bitget Academy](https://www.bitget.com/academy/bybit-regulation-202); contradicted by [Finder AU Bybit review](https://www.finder.com.au/cryptocurrency/exchanges/bybit-review). Check AUSTRAC's register directly.
- Binance offers Spot, Margin, Futures and Options APIs with free Spot Testnet and Futures Testnet — [Binance API page](https://www.binance.com/en/binance-api); [Binance developer docs](https://developers.binance.com/en)
- Independent Reserve and BTC Markets both offer API access; Independent Reserve fees from 0.5% down to 0.02% with volume, BTC Markets from 0.85% down to 0.10%; BTC Markets is AUD-only and Australian residents only; Independent Reserve supports AUD/NZD/USD/SGD — [Independent Reserve blog](https://www.independentreserve.com/blog/knowledge-base/btc-markets-vs-independent-reserve) (vendor source, compares itself favourably)
- BTC Markets operating since 2013, AUSTRAC-registered — [Bitget Academy](https://www.bitget.com/academy/how-reliable-btc-markets-in-australia-compared-to-other-crypto-exchanges) (low weight)

Thailand:
- Thai SEC ordered blocking of Bybit, OKX, CoinEx, XT.COM and 1000X effective 28 Jun 2025 for operating unlicensed; under the Royal Decree on technology crimes (effective 13 Apr 2025) MDES can block unauthorised platforms; penalties up to 3 years prison and 300,000 baht fines — [Cointelegraph](https://cointelegraph.com/news/thailand-blocks-okx-bybit-crypto-exchanges); [CoinDesk](https://www.coindesk.com/policy/2025/05/30/thailand-to-block-okx-bybit-and-others-citing-lack-of-license)
- Binance global was not on the June 2025 block list — [Cointelegraph](https://cointelegraph.com/news/thailand-blocks-okx-bybit-crypto-exchanges)

### Inferences
- Recommended: Kraken spot (BTC/AUD or BTC/USDT/USD) or Binance Australia spot for a Freqtrade bot. Both are well supported by CCXT/Freqtrade (Freqtrade support list not re-verified this session). Binance has a free spot testnet which is handy for integration testing; Kraken's spot sandbox availability is unverified.
- Avoid perps: ASIC enforcement history against two major venues, plus liquidation risk on a US$200 account. Offshore perps accessed by Australians carry regulatory and account-closure risk.
- Coinbase, Swyftx, CoinSpot: not researched this session. From prior knowledge (unverified), Swyftx and CoinSpot are retail brokers with limited or no public trading API suitable for Freqtrade; Coinbase Advanced Trade has an API and is available in Australia.
- On relocation to Thailand: an account opened as an Australian resident must generally be updated to the new residency (KYC); Bybit/OKX are off the table; licensed Thai venues (Bitkub, Binance TH/Gulf Binance) would be the domestic options, but their Freqtrade/CCXT support was not verified.
- Australian tax: every bot trade is a CGT event; the bot/dashboard should export a trade log (Freqtrade's `/trades` endpoint supports this).

### Gaps
- Could not confirm current (2026) Binance Australia spot API availability for new users, or whether it runs a separate AU-specific API.
- Did not verify each exchange's minimum BTC order size or current maker/taker fees (Kraken, Binance AU, Coinbase).
- AUSTRAC register and ASIC product intervention / leverage rules for retail crypto derivatives were not fetched directly.
- Bitkub / Gulf Binance API and CCXT support not researched.

## 4. API key security best practice

### Takeaway
Create a trade-only key (no withdrawals, no transfers), IP-whitelist it to the bot host, keep secrets out of git and out of the browser, and never expose the bot's own API to the internet.

### Cited Findings
- Freqtrade: "strongly recommend to not expose this API to the internet"; use SSH tunnels or VPNs; use strong unique passwords and JWT secrets — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- Freqtrade's API binds to 127.0.0.1 by default — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)

### Inferences
(Standard practice, not source-verified this session)
- Exchange key permissions: enable "trade" and "read" only; disable withdrawal, transfer, margin/futures unless needed.
- IP whitelist: works cleanly on a VPS with a static IP; on a home Mac the residential IP can change, which breaks a whitelisted key, another argument for a VPS.
- Store keys in a `.env` / Freqtrade `config-private.json` excluded via `.gitignore`, or macOS Keychain; never put them in the Next.js frontend. FastAPI should hold the Freqtrade JWT and proxy requests.
- Use a dedicated exchange sub-account holding only the bot's capital to cap loss if a key leaks.
- Enable 2FA on the exchange account and rotate keys periodically.

### Gaps
- Did not fetch exchange-specific API key guidance pages (Kraken/Binance) to cite permission names.

## 5. Operational concerns (24/7 running, monitoring, outages, rate limits)

### Takeaway
A US$5-6/month Linux VPS running Freqtrade in Docker with Telegram alerts is more reliable than a Mac, which sleeps, restarts for updates and has a changing IP. If the Mac is used, keep it awake and plugged in and accept some downtime; at 1h-daily candles a short outage is tolerable.

### Cited Findings
- Freqtrade pushes real-time trade events (fills, whitelist changes) over its WebSocket, usable for dashboard alerts — [Freqtrade REST API docs](https://www.freqtrade.io/en/stable/rest-api/)
- CCXT (which Freqtrade uses for exchange access) had a release on 23 Sep 2026 (v4.5.83), so exchange-adapter breakages get patched quickly — [GitHub ccxt](https://github.com/ccxt/ccxt)

### Inferences
(Standard practice, not source-verified this session)
- Mac: `caffeinate -s` or System Settings "prevent automatic sleeping when display is off" (on power adapter); run via launchd so it restarts on reboot (the user already uses launchd for a Telegram bot).
- VPS: Docker with `restart: unless-stopped`; Freqtrade's built-in Telegram integration gives trade notifications and /status, /stop commands out of the box.
- Place exchange-side stop-loss orders (Freqtrade `stoploss_on_exchange`) so protection survives a bot or host outage.
- Rate limits: at 1h-daily candles with one pair, request volume is tiny; CCXT's built-in rate limiter (enableRateLimit) handles it. Exchange maintenance windows should be alerted on via Telegram "bot heartbeat" checks.
- Keep the Freqtrade version pinned and update deliberately (monthly releases) after re-running backtests.

### Gaps
- No sourced figures for exchange uptime/outage frequency.
- Did not verify Freqtrade's Telegram and `stoploss_on_exchange` docs pages this session (well known features, but not cited).
