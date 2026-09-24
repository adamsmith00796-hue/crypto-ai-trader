# Evidence for Crypto Trading Strategies and Indicators (BTC/USDT and large caps), After Fees

Evidence grading used below:
- **A**: peer-reviewed or rigorous working paper, realistic costs, long sample, some out-of-sample (OOS) or multiple-testing control
- **B**: peer-reviewed or credible research, but costs ignored or unclear, short sample, or parameters chosen in-sample
- **C**: practitioner or vendor backtest, partial fee disclosure
- **D**: influencer or marketing claims, no reproducible backtest

Research date: 24 Sep 2026. Several primary PDFs (ScienceDirect, SSRN, Reading repository) blocked automated fetching. Where only an abstract or search snippet was available, this is flagged.

---

## 1. Time-series momentum and trend-following (MA crossovers, Donchian, TSMOM)

### Takeaway
This is the **strongest-evidenced family** for BTC and large caps. It works after realistic fees (about 10 to 15 bps per trade) mainly **long-only**, on **daily-to-weekly horizons**. The gain comes mostly from avoiding drawdowns, not from beating buy-and-hold on raw return. The short side of trend-following in crypto loses money, and the out-of-sample evidence for Bitcoin specifically is mixed.

### Cited Findings
- **Han, Kang & Ryu (SSRN 4675565, Dec 2023; "Time-Series and Cross-Sectional Momentum in the Cryptocurrency Market… under Realistic Assumptions").** Sample Dec 2013 to 28 Aug 2023. Coins had to have at least $1M market cap and $1M daily volume. **Assumed cost 15 bps per trade.** Their justification is that Binance charged 10 bps spot and 4.5 bps futures, and measured slippage averaged 1.53 bps, max 11.81 bps. Findings:
  - TSMOM is "strong". The strategy buys the market when its lookback return is in the top third of its history. The best rule used a 28-day lookback and 5-day hold: **Sharpe 1.51 vs market 0.85**, cumulative 36,686% vs 2,696%, **invested 48% of the time**.
  - It had a higher Sharpe than the market in 8 of 10 years, and lower volatility and max drawdown in every year.
  - After the 15 bps costs, every long-only portfolio except the (7,7) one still beat the market. Costs hurt shorter holding periods more.
  - **Short-only TSMOM lost money in almost every configuration even before costs.** Long-short underperformed long-only.
  - Cross-sectional momentum was weak. Of 21 portfolios, 5 were liquidated and only 6 beat the market. The best had Sharpe 1.28 vs 1.01.
  - The authors caution that lookback and hold were chosen optimally in-sample, which introduces look-ahead bias, so the results "should be regarded as an optimistic view". They also say the edge "can generate profits in the future only if the market continues to grow."
  — [Han, Kang & Ryu, SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4675565); [full PDF](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf). Grade **A-**.
- **Liu & Tsyvinski, "Risks and Returns of Cryptocurrency" (NBER w24877; RFS 2021).** Found time-series momentum: the current crypto market return predicts future market returns up to about 8 weeks ahead. They attribute this to investor attention, a view Han et al. contest. No trading-cost-adjusted strategy numbers were retrieved. — [NBER w24877](https://www.nber.org/system/files/working_papers/w24877/w24877.pdf); summary as cited in [Han et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf). Grade **B** (predictability shown, net-of-cost trading not shown).
- **Detzel, Liu, Strauss, Zhou & Zhu (Financial Management 2021, 50(1):107-137).** Ratios of price to its 5- to 100-day moving averages forecast **daily** BTC returns both in-sample and OOS. Strategies built on them earn "economically significant alpha and Sharpe ratio gains" over buy-and-hold. Macro variables largely fail to predict. The sample runs to about 2017-2018, which predates the modern market. The fee assumptions could not be retrieved. — [SSRN 3115846](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3115846); [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/fima.12310). Grade **B+**.
- **Hudson & Urquhart (Annals of Operations Research 297, 2021; "Technical trading and cryptocurrencies").** Tested about 15,000 rules from the 5 main classes (MA, filter, support/resistance, channel breakout, on-balance volume) on two BTC markets plus three other coins. They used multiple-hypothesis (data-snooping) corrections. They found significant predictability and profitability, and **breakeven transaction costs "substantially higher" than typical crypto costs**. Rules gave higher risk-adjusted returns than buy-and-hold and protected against deep drawdowns. **However, there was "no predictability for Bitcoin in the out-of-sample period"**, while other coins retained some. — [Semantic Scholar](https://www.semanticscholar.org/paper/Technical-trading-and-cryptocurrencies-Hudson-Urquhart/f5b07a2ef27fc544fff9ae800f508e7cf0a36941); [EconPapers](https://econpapers.repec.org/article/sprannopr/v_3a297_3ay_3a2021_3ai_3a1_3ad_3a10.1007_5fs10479-019-03357-1.htm). Grade **A** (this is the key negative result for BTC OOS).
- **Frömmel & Deprez (Int. Review of Economics & Finance vol. 93, 2024; "Are simple technical trading rules profitable in bitcoin markets?").** Only the abstract snippet was available, full text blocked. Simple technical rules can outperform buy-and-hold on BTC out-of-sample, "especially risk-return wise", when evaluated with multiple-hypothesis procedures and realistic conditions. The exact cost numbers and sample were not retrieved. — [SSRN 4401552](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4401552); [IDEAS](https://ideas.repec.org/a/eee/reveco/v93y2024ipbp858-874.html). Grade **B** (unverified detail).
- **Grobys, Ahmed & Sapkota (Finance Research Letters 32, 2020; "Technical trading rules in the cryptocurrency market").** A moving-average rule earned **8.76% p.a. excess return, but only when Bitcoin is excluded**. This implies the MA edge is weaker on BTC than on alts. — [IDEAS](https://ideas.repec.org/a/eee/finlet/v32y2020ics1544612319308852.html) (search-snippet level). Grade **B**.
- **Zarattini, Pagani & Barbon (Concretum, "Catching Crypto Trends").** An ensemble of Donchian-channel trend models across several lookbacks, with volatility-based sizing, run as a rotation across the top 20 liquid coins. It reports **net-of-fees Sharpe > 1.5 and 10.8% annualized alpha vs BTC**. The web page does not state fee levels, sample or drawdown. — [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/). Grade **B/C** (practitioner working paper, from a firm that sells strategies).
- **Concretum, "Seasonality in Bitcoin Intraday Trend Trading."** An ensemble of intraday trend models, long-short, vol-scaled to 20%, over 2018-2025. **Gross-of-fees Sharpe ≈ 1.6** vs ≈ 0.8 for vol-targeted long-only BTC. The edge is concentrated around the Sunday evening / Monday Asia open and is stronger after mid-2020. **No net-of-fee numbers given.** — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/). Grade **C** for net profitability.
- **"AdaptiveTrend" (arXiv 2602.11708, 2026).** A 6-hour trend system on 150+ Binance perps, OOS 2022-2024. It claims **Sharpe 2.41, MaxDD -12.7%, Calmar 3.18 net of costs and funding**. It is a single-author-group preprint with a short OOS window and has not been replicated. — [arXiv](https://arxiv.org/html/2602.11708v1). Grade **C** (treat as optimistic).

### Inferences
- The robust part is a **long-or-flat trend filter** on BTC or a large-cap basket, with lookbacks of about 20 to 100 days (MA ratio, 28-day TSMOM, Donchian ensemble). It cuts drawdowns at modest turnover, so 10 to 15 bps fees barely matter.
- Shorting on trend signals in crypto is **not supported**. Han et al. show short-only TSMOM loses even before costs.
- Evidence for **BTC alone** is weaker than for crypto baskets. Hudson & Urquhart found no BTC OOS predictability, and Grobys et al. found the MA premium outside BTC. A bot should expect trend rules to reduce drawdowns rather than beat buy-and-hold on raw return.
- Ensembles across lookbacks (Concretum) are the standard defence against picking one lucky parameter. Han et al. admit their best (28,5) pair was chosen ex post.

### Gaps
- Exact fee assumptions and post-2020 subsample results for Detzel et al., Hudson & Urquhart, and Frömmel & Deprez could not be retrieved (paywall/403).
- Corbet et al. (Economics Letters 2019, intraday variable-length MA on BTC) and the Grayscale 2023 MA-crossover report were not retrieved (rate-limited), so no numbers are cited.
- No AQR or Man Group crypto-specific trend papers were found in this session.

---

## 2. Mean reversion (RSI extremes, Bollinger Bands)

### Takeaway
There is **weak and regime-dependent** evidence. Naked mean reversion on BTC/ETH loses money after fees on 15m to 4h bars, and loses badly in bear markets. Among large coins the academic evidence favours momentum, not reversal, and reversal is mainly a small-coin phenomenon.

### Cited Findings
- **Han et al. (2023):** "Except for a few largest coins, the majority of the coins exhibit reversal rather than momentum". Reversal shows up among small coins, and losers "often rebound". — [Han et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf). Grade **A** (for the direction of the effect).
- **Coinquant "78 backtests" (practitioner, 2024).** Tested BB reversion, RSI-2 and MA-distance on BTC/USDT and ETH/USDT across 15m, 1h, 4h and 1d. It used "realistic fees and slippage" via the Nautilus Trader engine at tick level, with exact bps not stated. Windows were bear (2022), sideways (Apr-Oct 2023) and bull (Oct 2023 to Mar 2024).
  - **Average return by timeframe: 15m -14.4%, 1h -8.1%, 4h -9.5%, 1d -4.0%.**
  - By regime: **+16.3% in bull vs -40.6% in bear**.
  - One 15m Bollinger test made 693 trades and paid about $2,300 in fees on a $10k account.
  - 14 of 78 tests had win rates of 65% or more and still lost money.
  — [Coinquant](https://www.coinquant.ai/blog/building-a-mean-reversion-strategy-in-cryptocurrency-markets-evidence-from-78-backtests). Grade **C** (short windows, vendor).
- **QuantifiedStrategies (practitioner).** BTC RSI(25) rule: buy when RSI crosses below 30, exit above 80, Jan 2015 to Sep 2021. Profit factor 1.95, win rate 57.69%. Fee treatment was not confirmed, and the rule was picked as the best of several variations. — [QuantifiedStrategies](https://www.quantifiedstrategies.com/bitcoin-rsi-trading-strategy/). Grade **C/D** (in-sample selection).
- A 2019 Finance Research Letters study (search snippet only) reports that **only Bollinger Band and trading-range-breakout rules stayed profitable after costs, and only during market crashes**. — [ScienceDirect S1544612319303770](https://www.sciencedirect.com/science/article/abs/pii/S1544612319303770). Grade **B** (could not verify full text).

### Inferences
- If mean reversion is used at all, it belongs as a **pullback entry inside an established uptrend** (a trend filter on, RSI or BB dip as the timing trigger), on 4h or daily bars. It should not be a standalone signal, and never on 15m.
- High win rate is not evidence of edge. Mean reversion strategies typically have high win rates and fat left tails.

### Gaps
- No peer-reviewed study was found that tests RSI or Bollinger mean reversion on BTC with explicit bps costs and post-2022 OOS data.

---

## 3. Volatility breakout and volatility targeting

### Takeaway
Volatility **targeting** (scaling position size inversely to recent volatility) is well supported as a **risk tool**. Much of the Sharpe improvement credited to crypto trend systems is actually this volatility management. For volatility **breakout** as a standalone entry signal on BTC, no independent net-of-fee evidence was found.

### Cited Findings
- A volatility-adaptive trend study (Karassavidis et al., 2025, as summarized by a practitioner review) reports **Sharpe ≈ 1.54 for BTC and 1.80 for ETH, net of Binance futures fees, over 2020-2025**. The reviewer warns that a 5-year sample in a historic bull run is "a young-market artifact until it survives a full cycle" and that "most of the risk-adjusted improvement is the volatility management". — [Marrazzo Substack](https://antoniomarrazzo.substack.com/p/trend-following-mostly-a-volatility). Grade **B/C** (secondary summary).
- Vol-targeted (20%) long-only BTC had a Sharpe of just below 0.8 over 2018-2025, vs about 1.6 gross for an intraday trend ensemble. — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/). Grade **C**.
- Breakout-class rules (channel breakout, trading-range breakout) are among the 5 classes that Hudson & Urquhart found profitable in-sample with high breakeven costs. The Donchian ensemble (Zarattini et al.) is the breakout-style trend system with net-of-fee Sharpe > 1.5. — [Hudson & Urquhart](https://www.semanticscholar.org/paper/Technical-trading-and-cryptocurrencies-Hudson-Urquhart/f5b07a2ef27fc544fff9ae800f508e7cf0a36941); [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/).
- General background on vol targeting: [Quantpedia](https://quantpedia.com/an-introduction-to-volatility-targeting/).

### Inferences
- A bot should treat volatility as a **sizing input** (smaller positions when ATR or realized vol is high), not as one of the "agreeing dots". Donchian/channel breakout counts as a trend signal and overlaps with MA or TSMOM dots.

### Gaps
- No independent net-of-fee test was found for intraday "volatility squeeze" or ATR-breakout entries on BTC.

---

## 4. Crypto-specific signals (funding, OI, basis, on-chain, Fear & Greed)

### Takeaway
- **On-chain valuation (MVRV Z-score, NUPL)** has peer-reviewed support as a **cycle-level regime filter**, but it rests on only about 6 trades across 3 cycles.
- **Fear & Greed** mostly lags price and adds no out-of-sample forecasting value for daily returns.
- **Funding rates** are predictable themselves (useful for carry/arbitrage), but I found **no rigorous evidence that funding, OI or basis predict BTC direction net of costs**.

### Cited Findings
- **Grobys, Näsman & Sandretto (Research in International Business and Finance 89, 2026, 103486; "Using on-chain data to predict Bitcoin cycles").** BTC data Dec 2013 to Apr 2025, testing NUPL, MVRV Z-score and CVDD rules, long-only.
  - **MVRV Z-score rule: Sharpe 1.28 vs buy-and-hold 0.45.**
  - NUPL-3: annualized log return 0.63 vs 0.42 and Sharpe 1.12, with **max drawdown about -0.50 vs -0.85 for B&H**. Sharpe differences are significant (Opdyke t-stats 15 to 26), and the rules beat Monte Carlo random-entry.
  - The strategies make only **3 entries and 3 exits** over the whole horizon. The main tables **ignore costs**, and an unreported check at **2% per trade** was "qualitatively unchanged".
  - The authors admit exit thresholds "may reflect hindsight bias" from the metric creators. Sensitivity checks with 3 alternative thresholds were robust.
  — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0275531926002138); [open-access PDF](https://osuva.uwasa.fi/server/api/core/bitstreams/6575b90c-6140-44e7-a798-011a1793d134/content). Grade **B** (peer-reviewed, but about 6 trades gives very low statistical power despite the t-stats).
- **Fear & Greed Index (2026 study).** The FGI does **not** Granger-cause BTC returns and gives **no out-of-sample forecasting gain**. Returns Granger-cause the FGI, so it reacts to prices. — [ScienceDirect S305070062600006X](https://www.sciencedirect.com/science/article/pii/S305070062600006X). Older studies (monthly ARDL 2016-2021; EGARCH) found positive in-sample associations. — [doi 10.22495/cocv21i2art10](https://doi.org/10.22495/cocv21i2art10). Grade **A-** for "no OOS value" at daily frequency.
- **Funding rates.** Inan (SSRN 5576424) shows the *next* funding rate on Binance/Bybit BTC perps is predictable OOS with double-autoregressive models, beating no-change on both error and direction. This concerns predicting funding, not price. — [SSRN 5576424](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5576424). Funding-rate arbitrage risk/return is studied in [ScienceDirect S2096720925000818](https://www.sciencedirect.com/science/article/pii/S2096720925000818).
- The claim that extreme funding (above 0.10% per 8h) "often precedes corrections" comes from exchange education content (Bitget), and the same source notes strong trends can keep funding extreme for weeks. — [Bitget Academy](https://www.bitget.com/academy/12560603880561). Grade **D**.
- A 2026 perpetual-futures ML systematic review covers funding and OI as features; no specific net-of-cost predictive numbers were retrieved. — [Zenodo 19132841](https://zenodo.org/records/19132841).

### Inferences
- MVRV Z-score or NUPL is defensible as a **slow "regime" dot**, for example allowing longs unless the metric is in the euphoric zone. It should not be a trigger, because it changes state only a few times per cycle.
- Fear & Greed is largely a repackaging of momentum and volatility, so it would duplicate the trend dots.
- Funding/OI should be treated at most as a **crowding veto** (skip longs when funding is extremely high), and it is unproven.

### Gaps
- No peer-reviewed study was found that shows funding rate, open interest, basis, SOPR or exchange netflows predicting BTC direction out-of-sample net of fees.

---

## 5. Machine learning / "AI" models

### Takeaway
Independent, walk-forward, cost-aware studies find that ML forecasts carry **a little** information. After about 10 bps costs, however, the best models **do not significantly beat buy-and-hold**, and they turn a profit only when a cost-aware filter cuts trading by more than 90%. Reviews report that ML often *underperforms* simple technical rules once data snooping and frictions are controlled.

### Cited Findings
- **Bysik & Ślepaczuk (Univ. of Warsaw; arXiv 2606.00060, 2026).** Hourly BTC/USDT futures, 1 Jan 2018 to 1 Jan 2026 (about 70k bars). Models were XGBoost, LSTM and iTransformer, tested in a **27-fold walk-forward** (12-month train, 3-month validation, 3-month test). **Cost 10 bps per unit turnover.**
  - Best result (XGBoost, long-only, cost-aware): annualized return 65.40%, **Sharpe 1.09, max drawdown -67.42%**, 251 trades.
  - There was **no statistically significant Sharpe outperformance vs buy-and-hold** after bootstrap.
  - A naive 24h-momentum baseline returned **-45.93% after costs over 5,984 trades**.
  - The authors conclude that the forecast information "becomes valuable only when the trading rule accounts for the cost of acting on it".
  — [arXiv 2606.00060](https://arxiv.org/abs/2606.00060). Grade **A-**.
- A literature summary notes that White's Reality Check applied to ML crypto strategies found significant returns rare after data snooping and frictions, and ML underperformed technical analysis because of higher turnover. — [arXiv 2606.00060 lit review / search summary](https://arxiv.org/html/2606.00060v1). Grade **B** (secondary).
- Deep RL crypto trading backtests are prone to false positives from backtest overfitting (Gort et al.). — [arXiv 2209.05559](https://arxiv.org/pdf/2209.05559). Grade **B**.

### Inferences
- "AI" bot marketing that claims high Sharpe on 15m or 1h bars should be treated as **Grade D** unless it shows walk-forward results with fees. The best independent result (Sharpe about 1.1 with -67% drawdown) is roughly buy-and-hold-like.

### Gaps
- No independent audit of any commercial "AI trading bot" track record was found.

---

## 6. Does multi-indicator confluence help?

### Takeaway
**No direct academic test** of "N indicators must agree" confluence on crypto was found. The indirect evidence says:
- Confluence mainly **cuts trade count**, which genuinely helps after fees.
- Stacking **correlated** momentum oscillators (RSI, MACD, Stochastic, CCI) adds no independent information and increases overfitting risk.
- The documented benefit comes from **ensembling across lookbacks** and **combining different information types** (trend plus valuation regime plus volatility sizing).

### Cited Findings
- Turnover reduction is the proven benefit. A cost-aware filter reduced turnover by more than 90% and "restored profitability" of ML signals. Unfiltered 24h momentum lost 45.93% over 5,984 trades at 10 bps. — [Bysik & Ślepaczuk](https://arxiv.org/abs/2606.00060).
- Trend profits survive fees because positions are taken only when conditions are met: "the impact is not severe since the strategy takes positions only when the momentum condition is met." — [Han et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf).
- The data-snooping risk is real. Hudson & Urquhart needed multiple-testing corrections across about 15,000 rules, and the BTC edge vanished OOS. Han et al. flag that choosing optimal lookback/hold pairs introduces look-ahead bias. — [Hudson & Urquhart](https://www.semanticscholar.org/paper/Technical-trading-and-cryptocurrencies-Hudson-Urquhart/f5b07a2ef27fc544fff9ae800f508e7cf0a36941); [Han et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf).
- Ensembles of one signal type across many lookbacks (Donchian ensemble) are used explicitly "for improved robustness". — [Concretum](https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/).
- The Grobys et al. on-chain paper chose only 3 indicators to avoid "the data-mining risk that would arise from testing a large number of indicators and selecting only those that perform well ex post". — [Grobys et al. 2026](https://osuva.uwasa.fi/server/api/core/bitstreams/6575b90c-6140-44e7-a798-011a1793d134/content).

### Inferences
- For a "six-dot" panel, the dots should be **orthogonal information sources**, not six momentum oscillators. RSI, MACD and Stochastic are all transforms of recent price change. Requiring all three to agree is close to one signal with a stricter threshold, plus three sets of tunable parameters to overfit.
- An evidence-weighted panel might be built like this:
  1. Daily trend (price above a 50-100 day MA, or 28-day TSMOM positive)
  2. Multi-lookback Donchian/breakout ensemble agreement
  3. Higher-timeframe regime (weekly trend, or MVRV Z-score not euphoric)
  4. 4h pullback timing (RSI or BB dip within the uptrend)
  5. Volatility sanity check (feeding size, not direction)
  6. Crowding veto (funding not extreme; unproven)
  
  Dots 1 to 3 have the strongest evidence. Dots 4 and 6 are weakly evidenced.
- Evidence supports **long-or-flat** on spot BTC/USDT, not symmetric long/short.

### Gaps
- No peer-reviewed or reproducible practitioner study was found that measures the marginal value of adding the 2nd, 3rd... Nth agreeing indicator on crypto, or that quantifies RSI/MACD/Stochastic signal correlation on BTC. This would need an in-house test using walk-forward evaluation and a deflated Sharpe ratio.

---

## 7. Which timeframes have an edge that survives fees?

### Takeaway
**Daily (and multi-day holding) is the best-supported timeframe.** 4h is plausible for timing entries. 1h and 15m signals are generally destroyed by fees unless trades are heavily filtered. Intraday trend ensembles show gross edges, but their net-of-fee results are unpublished.

### Cited Findings
- Daily evidence: Detzel et al. (5-100 day MAs, daily), Han et al. (28-day lookback, 5-day hold, 15 bps) and Grobys et al. 2026 (cycle-level). — [Detzel](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3115846); [Han](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4675565); [Grobys 2026](https://www.sciencedirect.com/science/article/pii/S0275531926002138).
- Hourly: the ML best case had Sharpe 1.09 and -67% drawdown, not significantly better than B&H. Naive hourly-rebalanced 24h momentum lost 45.93% after 10 bps costs. — [Bysik & Ślepaczuk](https://arxiv.org/abs/2606.00060).
- Mean reversion by timeframe (practitioner): 15m -14.4%, 1h -8.1%, 4h -9.5%, 1d -4.0% average after fees. — [Coinquant](https://www.coinquant.ai/blog/building-a-mean-reversion-strategy-in-cryptocurrency-markets-evidence-from-78-backtests).
- Intraday trend ensemble: gross Sharpe about 1.6 (2018-2025), no net figures. — [Concretum](https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/). A 6h-bar perp trend system claims net Sharpe 2.41 (2022-2024, preprint). — [arXiv 2602.11708](https://arxiv.org/html/2602.11708v1).
- A search snippet reports "daily trading data is more successful than trading intraday data, and simple Moving Averages techniques are superior when dealing with daily data". I could not tie this to a specific verified paper in the result set. — [search result list incl. ScienceDirect S1544612319303770](https://www.sciencedirect.com/science/article/abs/pii/S1544612319303770). Grade **unverified**.
- Fee reference points: Binance about 10 bps spot and 4.5 bps futures taker (at time of Han et al.). Measured slippage averaged 1.53 bps. Han et al. consider 15 bps round-per-trade "closer to the lower limit". — [Han et al.](https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf).

### Inferences
- The bot's **direction** dots should be computed on daily or 4h bars. Lower timeframes, if used at all, should only refine entry price, not decide direction.
- At 10 to 15 bps per side, a strategy needs average gross profit per trade well above 0.3% (round trip) to survive. That rules out most 15m signal-driven trading on BTC.

### Gaps
- No independent, net-of-fee, post-2022 comparison of the same rule across 15m/1h/4h/1d on BTC in peer-reviewed literature was found. The only side-by-side found is the Coinquant vendor study.
