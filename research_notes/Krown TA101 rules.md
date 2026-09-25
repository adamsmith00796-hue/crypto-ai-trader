# Krown TA 101: rules extracted from the course

Source: Krown Trading "Ultimate Trading & TA Beginner's Course" (krown-trading.teachable.com/p/ta101),
all 12 lessons completed 25 Sep 2026 by a Claude in Chrome session. Rules below are what the written
material states. Gaps are marked [not stated]. The full system (lessons 9 and 10) is only in the videos.

## 1. Order of analysis (lessons 1, 6, 7)
- Trend (direction), then structure (location), then momentum (confirmation), then volatility (timing). Indicators only confirm.
- If you keep only one thing, keep trend.
- If any step fails, no trade. A setup that fails even one rule is skipped.

## 2. Trend (lesson 2)
- Uptrend = higher highs and higher lows. Downtrend = lower highs and lower lows. Anything else = range.
- A swing high/low only counts after price has reversed away from it.
- Trend is a filter, not an entry. Trade only in the trend's direction.
- Unclear trend: zoom out. Check weekly, daily and 4h.
- Which swings count is discretionary.

## 3. Support and resistance (lesson 3)
- Zones, not lines: from the wick extreme to the close of the reversal candle.
- Only obvious levels, mostly higher timeframes, only after price has reacted.
- Uptrend: buy at support. Downtrend: sell or short at resistance.
- Wait for a reaction at the zone. The confirming reaction is [not stated].
- Trap: price breaks slightly out of a zone then closes back inside. Break size [not stated].
- Against diagonal trendlines. Level choice is discretionary.

## 4. Moving average (lesson 4)
- 55 EMA. Long bias: price above it and slope rising. Short bias: below and falling.
- Flat EMA = no trade (how flat is [not stated]).
- Pullbacks in trends tend to find their higher low / lower high at the 55 EMA.
- MA crosses are not entries on their own (whipsaw in ranges).

## 5. RSI (lesson 5)
- Period [not stated], probably 14.
- Uptrend regime: RSI 40 to 80; dips to about 40 are the higher lows to buy.
- Downtrend regime: RSI 20 to 60; rallies to about 60 are lower highs to sell.
- Range regime: roughly 30 to 70; buy low, sell high inside the range.
- Overbought is not a sell in an uptrend. A one-bar spike past a regime level that snaps back is a strong signal.
- Divergence: 3 or 4 pushes from the same swing make a major reversal likely. Entry trigger [not stated].

## 6. Volatility (lesson 6)
- BBWP (The_Caretaker, TradingView). Settings [not stated]; indicator default length 13, lookback 252.
- BBWP below 35 = compression, don't trade trend setups. Above 75 = expansion. 95 to 100 tends to mark major highs/lows.
- Longer squeeze, bigger move. Timing only, never direction.

## 7. Patterns (lesson 7)
- All patterns reduce to swing labels. Reversal confirmed when the sequence breaks.
- Invalidation = the swing that must hold. Patterns fail 20 to 40% of the time.

## 8. Indicators and confluence (lessons 7, 8)
- At most three indicators: one trend, one momentum, one volatility.
- Indicators measuring the same thing count as one opinion.

## 9. The system (lessons 9, 10)
- 12h chart, 5 EMA, plus 21/55 EMA crossover ("Krown Cross").
- Entry, exit, stop and the 5 EMA's role: [not stated], video only.
- His backtest: 9 trades, 33% win rate, wins about 10x losses. Longs only.
- Measure win rate, average win vs loss, time in trade.

## 10. Execution and risk (lessons 9, 11)
- Take every trade that passes. Set the stop before entering.
- Fixed position size, raised only at preset milestones. Never size up to win back losses.
- Judge results in batches of 100 trades.

## Assessment (from the course session)
Sound, standard TA, but most core judgements (swings, zones, obvious levels, flat slope) are discretionary.
Nine trades is an anecdote, not a backtest.

## Testable versions to code
- Krown pullback: 55 EMA rising and price above it, RSI pullback to 40 to 45, BBWP above 35, stop below last confirmed higher low. Shorts mirrored.
- Krown Cross: 21/55 EMA cross on 12h (exact rules unknown, test common variants).
- Krown filters added to the six-dot bot: 55 EMA slope, BBWP band, RSI regime.

## Test results
See the section appended below after backtesting.

## Backtest results (25 Sep 2026)
$200 per coin, 0.12% cost per side, no leverage. Yearly return, SEEN 2021-23 / UNSEEN 2024-now.

| Strategy | BTC | ETH | SOL |
|---|---|---|---|
| Our six-dot bot, daily (close-only stop) | +24% / +34% | +68% / +24% | +104% / +1% |
| Krown pullback, 12h | +18% / +7% | +9% / +25% | +83% / +11% |
| Krown pullback + shorts, 12h | +12% / +4% | -9% / +38% | +72% / +8% |
| Krown Cross (21/55), 12h | +9% / +29% | -2% / +28% | +415% / +7% |
| Krown Cross + 5 EMA exit, 12h | +28% / +20% | +13% / +36% | +153% / +24% |
| Krown pullback, 4h | -7% / +4% | +14% / +13% | +22% / -2% |
| Krown pullback, 1d | +1% / -6% | -4% / -4% | -12% / +17% |

Findings: pullback and plain cross are weaker or erratic; 4h and daily pullbacks mostly lose.
Krown Cross + 5 EMA exit on 12h was positive in all six tests with about 4 trades a month per coin,
comparable returns to the six-dot bot, a candidate to run alongside it. Its exact rules are a guess
(the real ones are only in the lesson 9/10 videos).

### Correction (same day)
The first Krown test only charged the fee on entry. With fees on both sides, Krown Cross 12h makes
833 trades since 2021 and its edge mostly goes to fees: alone $200 -> $1,694 (drop 40%), and since 2024
only +20%/yr. Half six-dot + half Krown did NOT beat the six-dot bot on unseen 2024+ data (+29% vs +37%/yr),
so it was not added. The close-only stop idea from the course WAS adopted.
