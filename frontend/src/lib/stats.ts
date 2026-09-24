import type { MarketCoin } from "./api";

export const GREEN = "#2ee66b";
export const RED = "#ff4d5e";
export const YELLOW = "#f5c518";
export const BLUE = "#3d7bff";
export const CYAN = "#37d6ff";

export const usd = (n: number, dp = 0) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const price = (n: number) => (n >= 100 ? usd(n, 0) : n >= 1 ? usd(n, 2) : "$" + n.toPrecision(3));

export const pct = (n: number | null | undefined, dp = 2) =>
  n == null ? "--" : `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

export const tone = (n: number | null | undefined) => (n == null ? YELLOW : n >= 0 ? GREEN : RED);

/** Hourly-ish returns (%) from a sparkline. */
export function returns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1]) out.push(((series[i] - series[i - 1]) / series[i - 1]) * 100);
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Average return across coins at each time step: the market "wave". */
export function breadthWave(coins: MarketCoin[]): number[] {
  const rs = coins.map((c) => returns(c.sparkline_7d)).filter((r) => r.length);
  if (!rs.length) return [];
  const n = Math.min(...rs.map((r) => r.length));
  return Array.from({ length: n }, (_, i) => rs.reduce((s, r) => s + r[i], 0) / rs.length);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
