# Exits, Risk Management, Position Sizing, Fees and Timeframe for a $200 Automated BTC Bot

Research date: 24 Sep 2026. Fee figures were pulled from exchange pages or secondary summaries in Sep 2026; exchanges change schedules often, so re-check each official page before building. Items marked [UNVERIFIED] came from secondary sites only, or conflict with other sources.

## Exit methods compared (fixed TP ladders, ATR stops, trailing/chandelier/MA stops, time stops, signal-reversal, breakeven moves)

### Takeaway
The strongest rigorous evidence (Kaminski & Lo) shows stop-loss rules only add value when returns have momentum (positive serial correlation). Under a random walk they always reduce expected return. So stops and trailing exits suit trend-following, where BTC has documented momentum, and tend to hurt mean-reversion. I found no rigorous head-to-head crypto study comparing TP ladders, chandelier, ATR trailing and time stops. Any choice between those must be settled by the bot's own out-of-sample testing, with fees included.

### Cited Findings
- Under the random walk hypothesis, simple 0/1 stop-loss rules always decrease a strategy's expected return. With momentum (positive serial correlation), the "stopping premium" can be positive and is directly proportional to the strength of return persistence. [Kaminski & Lo, SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=968338); [MIT Open Access PDF](https://dspace.mit.edu/bitstream/handle/1721.1/114876/Lo_When%20Do%20Stop-Loss.pdf)
- Empirically (US monthly returns, 1950 to 2004), certain stop-loss rules added 50 to 100 bp per month over buy-and-hold during stop-out periods. At longer sampling frequencies, some stop-loss policies raised expected return while substantially reducing volatility. [Kaminski & Lo, Journal of Financial Markets 2014 (RePEc)](https://ideas.repec.org/a/eee/finmar/v18y2014icp234-254.html)
- Quantpedia's multi-timeframe BTC trend design uses a daily trend filter plus 1h signals. They report it cuts false signals and trade frequency and improves Sharpe and Calmar versus single-timeframe signals. [Quantpedia](https://quantpedia.com/how-to-design-a-simple-multi-timeframe-trend-strategy-on-bitcoin/)
- A decade-long academic study of crypto trend following exists (arXiv 2009.12155, "A Decade of Evidence of Trend Following Investing in Cryptocurrencies"). The PDF would not extract, so its specific results on exits and costs are NOT captured here. [arXiv](https://arxiv.org/pdf/2009.12155)

### Inferences
- For a **trend-following** BTC bot: use an initial volatility-scaled (ATR-based) stop to define risk, then a trailing exit (ATR/chandelier or an MA-cross/signal-reversal exit) that lets winners run. This fits the Kaminski & Lo condition: exits add value only when there is momentum to protect. A fixed TP ladder (TP1/TP2/TP3) caps the fat right tail that trend following depends on. Partial closes also multiply order count, and each extra fill pays fees. On a $200 account, splitting a ~$50 to $100 position into thirds also pushes each leg toward exchange minimums.
- For a **mean-reversion** bot: the logic flips. Fixed profit targets (e.g. revert to the mean or band midpoint) plus a time stop are the natural exits. Tight price stops are expected to cut expected return, per Kaminski & Lo under no-momentum conditions. A wide catastrophic stop is still needed for tail risk.
- Moving the stop to breakeven early behaves like a tighter stop. It raises win-rate optics but converts some would-be winners into scratch trades that still pay two fees. With 0.6 to 1.2% round trips (Swyftx/Coinbase), a "breakeven" exit is actually a net loss.
- The practical recommendation is one entry, one full exit, and at most two fills per trade. Pick between ATR-trailing and signal-reversal by walk-forward test, not by preference.

### Gaps
- No rigorous, peer-reviewed crypto-specific comparison of chandelier vs ATR-trailing vs MA-exit vs TP ladders vs time stops was found within the search budget. Robot Wealth, QuantStart and Ernie Chan material was not retrieved.
- The arXiv 2009.12155 results (Sharpe, drawdowns, cost sensitivity) could not be read. The report writer should not quote numbers from it.

## Position sizing (fixed-fractional 1%, volatility targeting, Kelly) for a $200 account

### Takeaway
Fixed-fractional risk of 0.5 to 1% per trade ($1 to $2) with a stop-distance-derived position size is appropriate. On spot this means the position notional will often be $40 to $100, well under the $200 balance, so no leverage is needed. Full Kelly is inappropriate because edge estimates from backtests are noisy. If Kelly is used at all, cap it at quarter-Kelly or less, and it will usually exceed 1% risk anyway. I found no citable sources for this section within the budget, so the maths below is derived and not quoted.

### Cited Findings
- (No external sources fetched for sizing theory. See Gaps.)

### Inferences (derived arithmetic, not sourced)
- Position size = (account × risk%) / stop distance%. With $200 at 1% risk ($2): a 2% stop gives a $100 notional, a 5% stop gives $40, and a 10% stop gives $20. At 0.5% risk, halve these.
- Volatility targeting sets the stop as k × ATR, so notional shrinks automatically when BTC volatility rises. This is the same mechanism as ATR-stop fixed-fractional sizing and is the simplest robust choice.
- Kelly f* = p − (1−p)/b. For example, p = 0.40 and b = 2.5 gives f* = 0.16 (16% of capital at risk per trade). Estimation error in p and b makes full Kelly dangerous, and a small bot has too few trades to estimate them. Fractional Kelly ≤ 0.25 is the common practitioner guard, but this is unsourced here.
- The binding constraint for $200 is exchange minimum order size and fee granularity, not the risk rule. Typical BTC minimum notionals are about US$5 to 10, but this is [UNVERIFIED]; see Gaps.

### Gaps
- Van Tharp, Kelly-fraction studies and volatility-targeting papers were not retrieved.
- Official minimum order sizes (Binance BTCUSDT min notional, Swyftx/CoinSpot/BTC Markets/IR minimums) were not confirmed from official pages. Independent Reserve's fee page gives a $100 trade example but no explicit minimum. [Independent Reserve fees](https://www.independentreserve.com/fees)

## Leverage and perpetual futures: liquidation risk, funding costs, retail outcomes

### Takeaway
Regulator data consistently shows most retail leveraged traders lose money: 68% in Australia (ASIC, CFDs), 74 to 89% in the EU (ESMA, CFDs), and only 19% profitable among the most active Australian traders. Crypto-specific academic work shows forced liquidations are frequent at high leverage. Australia caps retail crypto CFD leverage at 2:1. For a $200 bot the evidence argues for spot, or perps at ≤2x effective leverage used only for cheaper fees and short access, never for size.

### Cited Findings
- ASIC: only 32% of retail CFD clients made money after fees (68% lost). Of those trading most often (over 50 trades per month), only 19% were profitable after fees. [ASIC media release 26-004MR, Jan 2026](https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-004mr-asic-secures-nearly-40-million-in-refunds-to-investors-and-drives-change-after-cfd-sector-falls-short/); [ASIC REP 828 (Jan 2026)](https://download.asic.gov.au/media/tq0he35c/rep828-published-20-january-2026.pdf). Note that the search summary's "2023-34" year label is garbled, so check the exact period in REP 828.
- ASIC: over 133,000 retail clients (68%) lost more than $458 million in the reviewed period, and one issuer's exotic CFD product saw 72% of retail clients lose money. [ASIC REP 828](https://download.asic.gov.au/media/tq0he35c/rep828-published-20-january-2026.pdf)
- ASIC's product intervention caps retail CFD leverage on crypto-asset underlyings at 2:1 (50% margin). The order expires 23 May 2027 unless remade. [ASIC via search summary, see REP 828 / afslhouse](https://afslhouse.com.au/asic-cfd-product-intervention-order/) [verify on ASIC's site]
- ESMA (2018): National Competent Authority analyses found 74 to 89% of retail CFD accounts lose money, with average losses per client of €1,600 to €29,000. [ESMA press release](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-to-prohibit-binary-options-and-restrict-cfds-to-protect-retail-investors) (2018 data, now dated)
- BitMEX perpetuals study: daily forced liquidations averaged 3.51% (longs) and 1.89% (shorts). Liquidated investors used about 60x average leverage. The authors recommend margin of 33% (3x) for longs and 20% (5x) for shorts to get daily margin-call probability down to 1%. [arXiv 2102.04591](https://arxiv.org/abs/2102.04591)
- On Bybit perps, more than 95% of 1-day positions at 100x leverage end up liquidated. This came from a search summary of a related study and was not confirmed at source [UNVERIFIED]. [arXiv 2512.01112](https://arxiv.org/html/2512.01112v2)

### Inferences
- The ASIC finding that the most active traders (>50 trades/month) had a 19% profitability rate versus 32% overall is direct evidence that trade frequency after fees hurts retail outcomes. This supports a low-frequency bot.
- Offshore perps (Bybit/OKX/Binance global) are not bound by ASIC's 2:1 CFD cap. The evidence-based leverage ceiling for a bot is the BitMEX paper's 3x (long) / 5x (short) for 1% daily margin-call probability. Using 1 to 2x keeps liquidation far outside a volatility-scaled stop.
- Perp access for Australian retail on offshore venues, and later for Thai residents, is a regulatory/availability question not covered here.

### Gaps
- Funding-rate costs were not sourced. The commonly cited baseline of about 0.01% per 8h (≈0.03%/day, ≈11% per year on notional when positive) is [UNVERIFIED] and must be checked on Binance/Bybit funding history pages. Funding spikes well above this in trending bull phases.
- No exchange-published "% of retail perp traders who lose money" disclosure was found for crypto venues.

## Fee maths: exchanges available to Australians, break-even win rates, affordable round-trips

### Takeaway
Fees split exchanges into two classes. Global order-book venues (Binance spot 0.10%, BTC Markets 0.20% taker / −0.05% maker rebate, perps 0.02 to 0.055%) cost 0.04 to 0.4% per round trip. AU broker-style venues (Swyftx 0.6%, Independent Reserve 0.5%, Kraken Pro spot base tier 0.40/0.80% [conflict flagged], Coinbase Advanced Intro 0.60/1.20%, CoinSpot instant buy 1%) cost 1 to 2.4% per round trip. At a 2% stop, Swyftx fees alone consume 0.6R per trade and push break-even win rate at 2:1 reward-to-risk from 33% to 53%. A bot on those venues is not viable at any meaningful trade frequency.

### Cited Findings (fees at lowest tier)
- **Binance (AU site)**: spot 0.10% maker / 0.10% taker, with a 25% discount paying fees in BNB. [Binance fee page](https://www.binance.com/en-AU/fee/trading); discount per [Bitget academy](https://www.bitget.com/academy/binance-fees-2026) (secondary). Binance futures fees were not fetched.
- **Bybit USDT perpetuals**: 0.02% maker / 0.055% taker at the base tier. [Bybit fee rate page](https://www.bybit.com/en/announcement-info/fee-rate/); [Traders Union](https://tradersunion.com/brokers/crypto/view/bybit/futures-fees/)
- **OKX perpetuals**: 0.02% maker / 0.05% taker at the base tier. [Analytics Insight](https://www.analyticsinsight.net/cryptocurrency-analytics-insight/okx-vs-bybit-fees-features-crypto-trading-options-compared) (secondary, verify on okx.com). OKX spot fees were not retrieved.
- **Kraken**: the official fee page, fetched Sep 2026, shows Kraken Pro spot Tier 1 ($0+ volume) at 0.40% maker / 0.80% taker, and Kraken Futures at 0.02% maker / 0.05% taker. [Kraken fee schedule](https://www.kraken.com/features/fee-schedule). **Conflict/flag:** Kraken's long-standing base tier was 0.25%/0.40%. The 0.40/0.80 figure is either a 2026 change or a misread of a different product table, so re-check manually.
- **Coinbase Advanced**: Intro 1 tier at 0.60% maker / 1.20% taker. The $10k to $50k tier is 0.25% maker / 0.40% taker, and entry fees vary by region. [DataWallet / Coinbase blog via search](https://www.datawallet.com/crypto/coinbase-fees); [Coinbase blog](https://www.coinbase.com/blog/were-lowering-fees-for-many-active-traders-on-coinbase-advanced). The Australian entry tier was not confirmed [UNVERIFIED].
- **BTC Markets**: Bitcoin markets use −0.05% maker (rebate) / 0.20% taker, flat for all volumes. [BTC Markets support](https://support.btcmarkets.net/hc/en-us/articles/360038037153-Bitcoin-Markets-Maker-Taker-Fee-Model). The article date is unknown and the main fees page returned 403, so verify it is still current.
- **Independent Reserve**: 0.5% at the entry tier, down to 0.02% at AUD 200M+ monthly volume. [Independent Reserve fees](https://www.independentreserve.com/fees)
- **Swyftx**: 0.6% on buys and sells at the base tier, tiered down to 0.1% for high volume. [Swyftx fees](https://swyftx.com/au/fees/) (page did not render, figure via [cryptonews.com.au](https://cryptonews.com.au/guides/swyftx-vs-coinspot/)). Spread is additional.
- **CoinSpot**: 1% for instant buy/sell and 0.1% for market (order-book) orders, which are available on only about 15 coins. [cryptonews.com.au](https://cryptonews.com.au/guides/swyftx-vs-coinspot/) (secondary)
- Fee drag example: 50 trades per month at 0.1% per trade is a 5% monthly drag before any edge. [Coin Bureau backtesting guide](https://coinbureau.com/guides/how-to-backtest-your-crypto-trading-strategy)

### Break-even win-rate table (derived)
Formula: with reward:risk = b and round-trip cost c (in R units, c = round-trip fee% ÷ stop distance%), the break-even win rate is p = (1 + c) / (b + 1). Excludes slippage, spread and funding. With zero fees, break-even is 50% at 1R, 33.3% at 2R and 25% at 3R.

| Venue (taker both legs unless noted) | Round trip | Cost @2% stop | BE win% @1R | @2R | @3R | Cost @5% stop | BE @2R |
|---|---|---|---|---|---|---|---|
| Bybit perp (maker both legs) | 0.04% | 0.02R | 51.0 | 34.0 | 25.5 | 0.008R | 33.6 |
| OKX / Kraken futures perp taker | 0.10% | 0.05R | 52.5 | 35.0 | 26.2 | 0.02R | 34.0 |
| Bybit perp taker | 0.11% | 0.055R | 52.8 | 35.2 | 26.4 | 0.022R | 34.1 |
| Binance spot | 0.20% | 0.10R | 55.0 | 36.7 | 27.5 | 0.04R | 34.7 |
| BTC Markets taker | 0.40% | 0.20R | 60.0 | 40.0 | 30.0 | 0.08R | 36.0 |
| Independent Reserve | 1.00% | 0.50R | 75.0 | 50.0 | 37.5 | 0.20R | 40.0 |
| Swyftx | 1.20% | 0.60R | 80.0 | 53.3 | 40.0 | 0.24R | 41.3 |
| Kraken Pro spot taker (0.80%, flagged) | 1.60% | 0.80R | 90.0 | 60.0 | 45.0 | 0.32R | 44.0 |
| Coinbase Adv Intro taker | 2.40% | 1.20R | 110 (impossible) | 73.3 | 55.0 | 0.48R | 49.3 |

### Monthly fee drag on a $200 account (derived)
Assuming an average position of $100 (1% risk, 2% stop), monthly drag as % of the account = trades × round-trip% × 0.5.
- Binance spot (0.2% round trip): 10 trades = 1.0%, 30 trades = 3.0%, 100 trades = 10%.
- BTC Markets taker (0.4%): 10 trades = 2%, 30 trades = 6%, 100 trades = 20%.
- Swyftx (1.2%): 10 trades = 6%, 30 trades = 18%, 100 trades = 60%.
- Bybit perp taker (0.11%): 10 trades = 0.55%, 30 trades = 1.65%, 100 trades = 5.5%.
- Rule of thumb: keep fee drag under about a quarter of expected gross edge. With a realistic gross edge of 0.2 to 0.3R per trade on a trend system, cost per trade must stay ≤0.05 to 0.1R. That means Binance/perp-class fees with stops ≥2%, or BTC Markets using maker orders.

### Inferences
- The viable venues for a $200 bot are Binance (AU) spot, BTC Markets using post-only limit orders (the maker rebate makes entries cheap), or offshore perps at 1 to 2x. Swyftx, CoinSpot instant, Independent Reserve, Coinbase and Kraken at base tier are not viable for systematic trading. Their round-trip costs of 1 to 2.4% equal 0.5 to 1.2R at a 2% stop.
- Wider stops (higher timeframes) shrink fee cost in R units. Moving from a 2% to a 5% stop cuts Swyftx's cost from 0.6R to 0.24R. This is the mechanical reason higher timeframes survive fees better.
- Maker (limit) execution for entries is worth building in. It roughly halves perp costs and gives a rebate on BTC Markets. Exits on stops will usually be taker.

### Gaps
- Binance futures, OKX spot and Kraken fees were not all confirmed on official pages, and the Kraken figure conflicts with history.
- Swyftx/CoinSpot spreads (which add to headline fees) were not quantified.
- Minimum order sizes for every exchange are unconfirmed.
- Whether Binance AU offers API trading and derivatives to AU retail in 2026 was not checked. AUD funding via PayID was reportedly reinstated from Jan 2026. [Invezz](https://invezz.com/au/reviews/binance-review-australia/) (secondary)

## Timeframe: are 4h/daily more robust than 15m/1h for retail bots after costs?

### Takeaway
The evidence consistently points toward daily/4h trend signals, or a daily trend filter with at most 1h entries, for a small retail bot. Fee drag scales with trade count, execution quality dominates short-timeframe results, and ASIC data shows the highest-frequency retail traders do worst. Rigorous, peer-reviewed crypto timeframe comparisons were thin within this search budget.

### Cited Findings
- A daily BTC trend strategy may survive market-structure differences while shorter timeframes are affected more: "the shorter the timeframe and the smaller the edge, the more execution quality dominates." [Coinquant, 9 years of crypto backtests](https://www.coinquant.ai/blog/does-backtesting-actually-work-what-9-years-of-crypto-data-tells-us) (vendor blog, moderate reliability)
- An EMA 21/55 trend strategy on BTC 15m produced -6.5% in backtest, struggling against noise and fees. [Coinquant 15m backtest](https://www.coinquant.ai/strategies/btc-trend-following-15m-backtest) (vendor, single backtest)
- Adding a daily trend filter to 1h signals reduced false signals and trade frequency and improved Sharpe and Calmar on BTC. [Quantpedia](https://quantpedia.com/how-to-design-a-simple-multi-timeframe-trend-strategy-on-bitcoin/)
- ASIC: retail traders placing more than 50 trades per month were only 19% profitable after fees, versus 32% overall. [ASIC 26-004MR](https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-004mr-asic-secures-nearly-40-million-in-refunds-to-investors-and-drives-change-after-cfd-sector-falls-short/)
- Excluding costs makes backtests look dramatically better than live results. [Coin Bureau](https://coinbureau.com/guides/how-to-backtest-your-crypto-trading-strategy)

### Inferences
- Target 2 to 10 round trips per month on 4h/daily signals. At Binance-class fees this is about 0.2 to 1% monthly drag on the account (table above). A 15m system with 50 to 150 trades per month would need a gross edge of 5 to 15% per month just to pay fees, which is not credible.
- Higher timeframes also mean wider ATR stops (typically 3 to 8% on BTC daily versus about 0.5 to 1% on 15m; approximate, not sourced). This cuts fee cost in R units by 5 to 10x.
- The trade-off is fewer trades, so statistical validation takes longer. Paper-trade or backtest across multiple BTC cycles rather than judging on weeks of live results.

### Gaps
- No peer-reviewed study directly comparing crypto trend-following performance by bar timeframe net of costs was retrieved. The arXiv 2009.12155 decade study may contain this, but it could not be parsed.
- Slippage estimates for $50 to $100 BTC orders were not sourced. They are likely negligible on Binance/Bybit order books but not on thin AU books.
