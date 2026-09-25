export type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change_24h_pct: number | null;
  market_cap: number;
  sparkline_7d: number[];
};

export type TrendingCoin = {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
};

export type PortfolioHolding = {
  label: string;
  source: string;
  symbol: string;
  quantity: number;
  price: number;
  value: number;
};

export type Position = {
  symbol: string;
  quantity: number;
  avg_buy_price: number;
  price: number;
  value: number;
  profit: number;
  gain_pct: number;
  alert: boolean;
};

export type Portfolio = {
  positions?: Position[];
  alert_gain_pct?: number;
  total_value: number;
  holdings: PortfolioHolding[];
  using_example_data: boolean;
  connections?: Record<string, { connected: boolean; error: string | null; replaced: string[] }>;
};

export type NewsItem = {
  source: string;
  title: string;
  link: string;
  published: string | null;
};

export type HoldingNews = NewsItem & { symbol: string };

export type Sentiment = {
  value: number;
  label: string;
  history_7d: { value: number; label: string }[];
};

export type BotStats = {
  start: number;
  end: number;
  return_pct: number;
  worst_drop_pct: number;
  yearly: { year: number; return_pct: number }[];
  trades?: number;
  trades_per_month?: number;
  win_rate_pct?: number;
};

export type BotPosition = {
  coin: string;
  sleeve: string;
  entry_date: string;
  entry_price: number;
  last_price: number;
  stop: number;
  value: number;
  pnl: number;
  pnl_pct: number;
};

export type BotTrade = {
  coin: string;
  sleeve: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  reason: string;
  pnl: number;
  pnl_pct: number;
};

export type BotStatus =
  | { ready: false; message: string }
  | {
      ready: true;
      mode: "paper";
      capital: number;
      updated_at: number;
      last_candle: string;
      coins_scanned: number;
      cost_per_side_pct: number;
      exchange: string;
      dots: { key: string; label: string; desc: string }[];
      sleeves: { key: string; label: string; share: number; slots: number }[];
      scanner: { coin: string; price: number; status: "IN TRADE" | "SELL" | "BUY" | "READY" | "WATCHING"; dots: Record<string, boolean>; dots_at_close: Record<string, boolean>; green: number; strength: number }[];
      paper: {
        start_date: string;
        started: boolean;
        stats: BotStats | null;
        curve: [number, number][];
        positions: BotPosition[];
        pending: { action: string; coin: string; sleeve: string }[];
        trades: BotTrade[];
        cash: number;
        halted: string | null;
      };
      health: {
        verdict: "ON TRACK" | "WATCH" | "WARNING" | "STOPPED";
        note: string;
        drop_now_pct: number;
        worst_tested_pct: number;
        safety_limit_pct: number;
        bot_6m_pct: number | null;
        btc_6m_pct: number | null;
      };
      news_brake: { on: boolean; headlines: string[]; crisis_headlines_24h: number };
      backtest: {
        start_date: string;
        bot: BotStats;
        hold_btc: BotStats;
        rule_200: BotStats;
        windows: Record<string, { bot: number | null; hold_btc: number | null }>;
        curves: { bot: [number, number][]; hold_btc: [number, number][]; rule_200: [number, number][] };
        positions: BotPosition[];
        recent_trades: BotTrade[];
      };
    };

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const api = {
  market: () => getJSON<MarketCoin[]>("/api/market"),
  trending: () => getJSON<TrendingCoin[]>("/api/market/trending"),
  portfolio: () => getJSON<Portfolio>("/api/portfolio"),
  news: () => getJSON<NewsItem[]>("/api/news"),
  holdingsNews: () => getJSON<HoldingNews[]>("/api/news/holdings"),
  sentiment: () => getJSON<Sentiment>("/api/sentiment"),
  bot: () => getJSON<BotStatus>("/api/bot"),
};
