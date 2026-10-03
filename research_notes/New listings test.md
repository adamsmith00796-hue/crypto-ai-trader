# New listings test (3 Oct 2026)

Question from Adam: new tokens pump at launch and then fall. Can the bot catch either side, on Hyperliquid?

Data: daily candles for every Binance USDT pair first listed after mid-Jan 2021: 485 coins, including
about 250 since-delisted pairs (so the failures are counted). Fees 0.1% per side. Shorts at 1x,
liquidated if the price doubles, funding charged per day. Seen = 2021-23 listings, unseen = 2024+.
Scripts: scratchpad only (fetch_listings.py, listing_test.py, listing_port.py).

## Buying (long)

| Rule | 2021-23 median | 2024+ median | 2024+ win rate |
|---|---|---|---|
| Buy at launch-day close, hold 30 days | -26% | -17% | 33% |
| Buy at launch-day close, hold 180 days | -56% | -45% | 24% |
| Launch-day close, moonshot exits | -15% | -15% | 22% |

Launch-day open to close: median +24% / +27%, but the "open" is the first trade, which only sniper
bots get. Anyone buying after day one is, on average, buying the top.

## Shorting

Per trade it looks good: short at launch-day close, cover after 30 days, avg +7% to +9%, win rate
around 60-70%, in both seen and unseen data. But:

- 11% of shorts (no stop) were liquidated (price doubled); with a +30% stop, 25% lost more than 30%.
- Funding decides it: at 0.05%/day the 30-day short averages +7.7%, at 0.30%/day only +1.2%.
  Crowded new-token shorts often pay high funding.
- As a real account (10% per short, max 10 at once), the best version made $1,000 -> $4,965 but
  almost all of it came from 2025 (+304%), with a 51% worst drop; 2024 and 2026 lost money. Other
  versions dropped 64-93%. Losses cluster: in hot markets every new coin pumps at once.

## Verdict

Not worth it. Buying new listings loses money. Shorting them has an edge per trade, but it rests on
one exceptional year, is very sensitive to funding, and has drops that would break a $700 account.
Sniping the first seconds is a speed race against professional bots placed next to the exchange;
a small server in Sydney can't win it.
