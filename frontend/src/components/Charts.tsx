import type { MarketCoin } from "@/lib/api";
import { BLUE, CYAN, GREEN, RED, YELLOW, usd, pct, pearson, price, returns, tone } from "@/lib/stats";

/* ---------- Candlesticks from a sparkline (3-point groups) ---------- */
export function CandleChart({ series }: { series: number[] }) {
  const W = 320, H = 150, group = 3;
  const candles: { o: number; c: number; h: number; l: number }[] = [];
  for (let i = 0; i + group <= series.length; i += group) {
    const g = series.slice(i, i + group);
    candles.push({ o: g[0], c: g[g.length - 1], h: Math.max(...g), l: Math.min(...g) });
  }
  if (!candles.length) return null;
  const min = Math.min(...candles.map((c) => c.l));
  const max = Math.max(...candles.map((c) => c.h));
  const y = (v: number) => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
  const bw = W / candles.length;
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-label="Bitcoin 7 day candles">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" />
      ))}
      {candles.map((c, i) => {
        const up = c.c >= c.o;
        const col = up ? GREEN : RED;
        const x = i * bw + bw / 2;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
            <rect x={x - bw * 0.3} width={bw * 0.6} y={Math.min(y(c.o), y(c.c))} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} fill={col} />
          </g>
        );
      })}
      <line x1={0} x2={W} y1={y(last)} y2={y(last)} stroke={YELLOW} strokeDasharray="3 3" strokeWidth={0.8} />
    </svg>
  );
}

/* ---------- Scatter: market cap vs 24h move ---------- */
export function MoverScatter({ coins }: { coins: MarketCoin[] }) {
  const W = 900, H = 120;
  const caps = coins.map((c) => Math.log10(c.market_cap));
  const cmin = Math.min(...caps), cmax = Math.max(...caps);
  const chg = coins.map((c) => c.change_24h_pct ?? 0);
  const lim = Math.max(2, ...chg.map(Math.abs));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-label="Scatter of market cap against 24 hour change">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 4" />
      {coins.map((c, i) => {
        const x = 14 + ((caps[i] - cmin) / (cmax - cmin || 1)) * (W - 28);
        const y = H / 2 - (chg[i] / lim) * (H / 2 - 12);
        const col = tone(c.change_24h_pct);
        return (
          <g key={c.id}>
            <circle cx={x} cy={y} r={3 + 5 * ((caps[i] - cmin) / (cmax - cmin || 1))} fill={col} opacity={0.75} />
            <text x={x} y={y - 9} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)">{c.symbol}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Heat tiles ---------- */
export function HeatGrid({ coins }: { coins: MarketCoin[] }) {
  const lim = Math.max(3, ...coins.map((c) => Math.abs(c.change_24h_pct ?? 0)));
  return (
    <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-8">
      {coins.slice(0, 16).map((c) => {
        const v = c.change_24h_pct ?? 0;
        const a = 0.25 + 0.75 * Math.min(1, Math.abs(v) / lim);
        const bg = v >= 0 ? `rgba(46,230,107,${a * 0.85})` : `rgba(255,77,94,${a * 0.85})`;
        return (
          <div key={c.id} className="rounded-sm px-1.5 py-1 text-center leading-tight" style={{ background: bg, color: a > 0.6 ? "#04120a" : "#fff" }}>
            <div className="text-[9px] font-bold opacity-80">{c.symbol}</div>
            <div className="text-[13px] font-bold tabular-nums">{pct(v, 1)}</div>
            <div className="text-[8px] opacity-70 tabular-nums">{price(c.price)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Mirrored wave band ---------- */
export function WaveBand({ wave }: { wave: number[] }) {
  const W = 800, H = 110, mid = H / 2;
  if (!wave.length) return null;
  const lim = Math.max(...wave.map(Math.abs), 0.001);
  const bw = W / wave.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-label="Average market return per hour over 7 days">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(255,255,255,0.15)" />
      {wave.map((v, i) => {
        const h = (Math.abs(v) / lim) * (mid - 4);
        const up = v >= 0;
        return (
          <g key={i}>
            <rect x={i * bw + 1} width={bw - 2} y={up ? mid - h : mid} height={h} fill={up ? (v > lim * 0.5 ? YELLOW : GREEN) : RED} opacity={0.85} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Return distribution (two smooth areas) ---------- */
export function Distribution({ coins }: { coins: MarketCoin[] }) {
  const W = 360, H = 130, bins = 28;
  const all = coins.flatMap((c) => returns(c.sparkline_7d));
  if (all.length < 10) return null;
  const lim = Math.max(...all.map(Math.abs));
  const counts = new Array(bins).fill(0);
  for (const r of all) counts[Math.min(bins - 1, Math.floor(((r + lim) / (2 * lim)) * bins))]++;
  const sm = counts.map((_, i) => (counts[i - 1] ?? counts[i]) * 0.25 + counts[i] * 0.5 + (counts[i + 1] ?? counts[i]) * 0.25);
  const peak = Math.max(...sm);
  const X = (i: number) => (i / (bins - 1)) * W;
  const Y = (v: number) => H - 14 - (v / peak) * (H - 26);
  const area = (from: number, to: number) => {
    let d = `M${X(from)},${H - 14}`;
    for (let i = from; i <= to; i++) d += ` L${X(i).toFixed(1)},${Y(sm[i]).toFixed(1)}`;
    return d + ` L${X(to)},${H - 14} Z`;
  };
  const half = bins / 2;
  const mean = all.reduce((s, v) => s + v, 0) / all.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Distribution of hourly returns across the watchlist">
        <path d={area(0, half)} fill={RED} opacity={0.55} />
        <path d={area(half, bins - 1)} fill={GREEN} opacity={0.55} />
        <line x1={W / 2} x2={W / 2} y1={6} y2={H - 14} stroke={YELLOW} strokeDasharray="3 3" />
        <text x={W / 2 + 4} y={12} fontSize={8} fill={YELLOW}>0%</text>
        <text x={2} y={H - 2} fontSize={8} fill="rgba(255,255,255,0.5)">{(-lim).toFixed(1)}%</text>
        <text x={W - 2} y={H - 2} fontSize={8} textAnchor="end" fill="rgba(255,255,255,0.5)">+{lim.toFixed(1)}%</text>
      </svg>
      <p className="mt-1 text-[10px] text-white/50">
        {all.length} hourly returns · mean <span style={{ color: tone(mean) }}>{pct(mean, 3)}</span>
      </p>
    </div>
  );
}

/* ---------- Correlation matrix ---------- */
export function Correlation({ coins }: { coins: MarketCoin[] }) {
  const top = coins;
  const rs = top.map((c) => returns(c.sparkline_7d));
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `28px repeat(${top.length}, 1fr)` }}>
      <div />
      {top.map((c) => (
        <div key={c.id} className="text-center text-[8px] text-white/50">{c.symbol}</div>
      ))}
      {top.map((row, i) => (
        <div key={row.id} className="contents">
          <div className="pr-1 text-right text-[8px] leading-[18px] text-white/50">{row.symbol}</div>
          {top.map((col, j) => {
            const r = i === j ? 1 : pearson(rs[i], rs[j]);
            const a = Math.min(1, Math.abs(r));
            return (
              <div
                key={col.id}
                title={`${row.symbol}/${col.symbol} ${r.toFixed(2)}`}
                className="h-[18px] rounded-[2px] text-center text-[8px] leading-[18px] tabular-nums"
                style={{ background: r >= 0 ? `rgba(61,123,255,${0.15 + a * 0.7})` : `rgba(255,77,94,${0.15 + a * 0.7})`, color: "#fff" }}
              >
                {r.toFixed(1)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- Fear & greed gauge ---------- */
export function Gauge({ value, label }: { value: number; label: string }) {
  const R = 56, cx = 70, cy = 70;
  const ang = Math.PI * (1 - value / 100);
  const px = cx + R * Math.cos(ang), py = cy - R * Math.sin(ang);
  const col = value < 25 ? RED : value < 45 ? "#ff9a3d" : value < 55 ? YELLOW : value < 75 ? GREEN : CYAN;
  return (
    <svg viewBox="0 0 140 84" className="w-full" aria-label={`Fear and greed index ${value}, ${label}`}>
      <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={9} strokeLinecap="round" />
      <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${px},${py}`} fill="none" stroke={col} strokeWidth={9} strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={700} fill={col}>{value}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.6)" letterSpacing={1.5}>{label.toUpperCase()}</text>
    </svg>
  );
}

export function SentimentBars({ history }: { history: { value: number }[] }) {
  const max = 100;
  return (
    <div className="flex h-16 items-end gap-1">
      {[...history].reverse().map((h, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5">
          <span className="text-[8px] text-white/50">{h.value}</span>
          <div className="w-full rounded-sm" style={{ height: `${(h.value / max) * 100}%`, background: h.value >= 55 ? GREEN : h.value >= 45 ? YELLOW : RED, opacity: 0.85 }} />
        </div>
      ))}
    </div>
  );
}

export function AllocationBars({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const colors = [GREEN, YELLOW, BLUE, CYAN, "#c084fc", RED];
  return (
    <div className="space-y-1.5">
      {items.slice(0, 6).map((it, i) => (
        <div key={it.label}>
          <div className="flex justify-between text-[9px] text-white/60">
            <span>{it.label}</span>
            <span className="tabular-nums">{usd(it.value)} · {((it.value / total) * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${(it.value / total) * 100}%`, background: colors[i % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
