"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Orb } from "@/components/Orb";
import { SystemStatus } from "@/components/SystemStatus";
import { CYAN, YELLOW, pct, price, usd } from "@/lib/stats";
import { radarRows, useBot, type Ready } from "@/lib/useBot";

const INK = "#a9bbd3";

export default function Command() {
  const { bot, err } = useBot();
  return (
    <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-[22px] font-bold tracking-[3px]">SIX<span className="text-[var(--cyan)]">/</span>DOT</h1>
          <span className="label">Command centre</span>
        </div>
        <div className="flex items-center gap-3">
          <Clock />
          <SystemStatus bot={bot} err={err} />
          <a href="/" className="border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-[#a9bbd3] hover:text-white">PHONE VIEW</a>
        </div>
      </header>
      {err && <p className="border border-[var(--yellow)] px-3 py-2 text-[12px] text-[var(--yellow)]">Can&apos;t reach the bot: {err}</p>}
      {bot?.ready ? <Deck b={bot} /> : <p className="label py-24 text-center">{bot && !bot.ready ? bot.message : "Connecting to the bot"}</p>}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return <span className="hidden font-mono text-[12px] tabular-nums text-[#a9bbd3] md:inline">{now.toISOString().slice(11, 19)} UTC</span>;
}

function Deck({ b }: { b: Ready }) {
  const l = b.live;
  const rows = radarRows(b);
  const total = b.dots.length;
  const lead = rows[0];
  const equity = l?.equity ?? 0;
  const today = l?.day_start != null ? equity - l.day_start : null;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Account value" value={usd(equity, 2)} big />
        <Kpi label="Today" value={today == null ? "--" : `${today < 0 ? "-" : "+"}${usd(Math.abs(today), 2)}`} color={today != null && today < 0 ? YELLOW : CYAN} />
        <Kpi label="Since start" value={l?.capital ? pct((equity / l.capital - 1) * 100, 1) : "--"} />
        <Kpi label="Cash" value={usd(l?.usdc ?? 0, 0)} />
        <Kpi label="Same rules, tested" value={b.versus ? pct(b.versus.test_pct, 1) : "--"} color={INK} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden">
          <p className="label absolute left-4 top-3">Coin orbit · live dots</p>
          <SizedOrb coins={rows.map((r) => ({ coin: r.coin, green: r.green, held: r.held }))} total={total} />
          <p className="absolute bottom-3 left-4 right-4 text-center text-[11px] text-[#a9bbd3]">
            Closer and brighter = more dots · gold = the coin the bot holds
          </p>
        </Card>
        <div className="space-y-3">
          <Focus b={b} coin={lead?.held ? lead.coin : lead?.coin} />
          <Matrix b={b} rows={rows} />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Terminal b={b} />
        <Systems b={b} />
      </section>
    </>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-[var(--line)] bg-[rgba(8,12,20,0.85)] p-4 ${className}`}>{children}</div>;
}

function Kpi({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <Card className={big ? "col-span-2 md:col-span-1" : ""}>
      <p className="label">{label}</p>
      <p className={`display mt-1 font-bold tabular-nums ${big ? "text-[30px]" : "text-[22px]"}`} style={{ color }}>{value}</p>
    </Card>
  );
}

/** The orb, as big as its box allows. */
function SizedOrb(props: { coins: { coin: string; green: number; held: boolean }[]; total: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setSize(Math.round(Math.min(620, el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} className="flex w-full justify-center">{size > 0 && <Orb {...props} size={size} />}</div>;
}

/** The coin the bot holds (or is closest to buying): price chart with what it paid and where it sells. */
function Focus({ b, coin }: { b: Ready; coin?: string }) {
  const pos = b.live?.positions?.find((p) => p.coin === coin);
  const pts = (coin && b.closes?.[coin]) || [];
  if (!coin || pts.length < 2) return null;
  const vals = pts.map((p) => p[1]).concat(pos ? [pos.paid, pos.stop] : []);
  const lo = Math.min(...vals) * 0.98, hi = Math.max(...vals) * 1.02;
  const W = 600, H = 200;
  const x = (i: number) => (i / (pts.length - 1)) * (W - 70);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1][1];
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-[20px] font-bold">{pos ? `IN ${coin}` : `WATCHING ${coin}`}</h2>
        {pos ? (
          <span className="text-[16px] font-bold tabular-nums" style={{ color: pos.pnl_pct < 0 ? YELLOW : CYAN }}>{pct(pos.pnl_pct, 1)}</span>
        ) : (
          <span className="text-[13px] tabular-nums text-[#a9bbd3]">{price(last)}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-[180px] w-full" preserveAspectRatio="none" role="img"
        aria-label={`${coin} price, last 90 days${pos ? ", with the buy price and sell point" : ""}`}>
        <polygon points={`0,${H} ${line} ${x(pts.length - 1)},${H}`} fill="rgba(92,225,255,0.08)" />
        <polyline points={line} fill="none" stroke={CYAN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {pos && [[pos.paid, "#e8f1ff", "PAID"], [pos.stop, YELLOW, "SELL"]].map(([v, c, t]) => (
          <g key={t as string}>
            <line x1="0" x2={W - 70} y1={y(v as number)} y2={y(v as number)} stroke={c as string} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            <text x={W - 64} y={y(v as number) + 4} fontSize="12" fill={c as string}>{t as string}</text>
          </g>
        ))}
      </svg>
      {pos && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#a9bbd3]">
          <div>SELL POINT<div className="mt-1 text-[14px] tabular-nums text-[var(--yellow)]">{price(pos.stop)}</div></div>
          <div>PAID<div className="mt-1 text-[14px] tabular-nums text-white">{price(pos.paid)}</div></div>
          <div>NOW<div className="mt-1 text-[14px] tabular-nums text-white">{price(pos.now)}</div></div>
        </div>
      )}
    </Card>
  );
}

function Matrix({ b, rows }: { b: Ready; rows: ReturnType<typeof radarRows> }) {
  return (
    <Card>
      <div className="label flex justify-between pb-2"><span>Dot matrix</span><span>{b.dots.map((d) => d.label[0]).join(" ")}</span></div>
      {rows.map((r) => (
        <div key={r.coin} className="flex h-8 items-center gap-3 border-t border-[#14243a] text-[12px]">
          <span className="display w-14 font-semibold" style={{ color: r.held ? YELLOW : undefined }}>{r.coin}</span>
          <span className="flex grow gap-1.5" role="img" aria-label={`${r.green} of ${b.dots.length} dots`}>
            {b.dots.map((d) => (
              <span key={d.key} className="inline-block h-2.5 w-2.5 rounded-full border"
                style={{ background: r.dots[d.key] ? "var(--cyan)" : "transparent", borderColor: r.dots[d.key] ? "var(--cyan)" : "#4a6078" }} />
            ))}
          </span>
          <span className="tabular-nums text-[#a9bbd3]">{price(r.price)}</span>
        </div>
      ))}
    </Card>
  );
}

type LogLine = { t: number; tag: string; text: string; color: string };

/** A running log: the bot's real trades, then one line per refresh while the page is open. */
function Terminal({ b }: { b: Ready }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  useEffect(() => {
    const l = b.live;
    const held = (l?.positions ?? []).map((p) => `${p.coin} ${pct(p.pnl_pct, 1)}`).join(", ") || "cash";
    const check: LogLine = {
      t: b.updated_at * 1000, tag: "CHECK", color: CYAN,
      text: `equity ${usd(l?.equity ?? 0, 2)} · holding ${held} · news brake ${b.news_brake.on ? "ON" : "off"} · BTC weather ${b.market?.btc_above_200 === false ? "bad" : "good"}`,
    };
    setLines((prev) => {
      if (prev.length) return prev.some((x) => x.t === check.t) ? prev : [...prev, check].slice(-40);
      const trades = (l?.history ?? []).slice(0, 8).reverse().map((h) => ({
        t: h.t, tag: h.side === "buy" ? "BUY" : "SELL", color: h.side === "buy" ? CYAN : YELLOW,
        text: `${h.coin} ${usd(h.usd, 2)} at ${price(h.price)}`,
      }));
      return [{ t: b.updated_at * 1000 - 1, tag: "SYS", color: INK, text: "link established · Hyperliquid spot · checks every 5 min" }, ...trades, check]
        .sort((x, y) => x.t - y.t);
    });
  }, [b]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lines]);
  const stamp = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
  return (
    <Card>
      <p className="label pb-2">Bot log</p>
      <div className="h-[260px] overflow-y-auto font-mono text-[12px] leading-relaxed">
        {lines.map((x, i) => (
          <div key={i} className="flex gap-3">
            <span className="shrink-0 tabular-nums text-[#6c7f97]">{stamp(x.t)}</span>
            <span className="w-12 shrink-0 font-bold" style={{ color: x.color }}>{x.tag}</span>
            <span className="text-[#cfe3f5]">{x.text}</span>
          </div>
        ))}
        {b.waiting && (
          <div className="flex gap-3">
            <span className="shrink-0 tabular-nums text-[#6c7f97]">{stamp(b.updated_at * 1000)}</span>
            <span className="w-12 shrink-0 font-bold text-[var(--yellow)]">WAIT</span>
            <span className="text-[#cfe3f5]">{b.waiting}</span>
          </div>
        )}
        <div ref={end} className="mt-1 h-4 w-2 animate-pulse bg-[var(--cyan)]" />
      </div>
    </Card>
  );
}

function Systems({ b }: { b: Ready }) {
  const h = b.health, nb = b.news_brake;
  const room = Math.max(0, h.safety_limit_pct - h.drop_now_pct);
  const rows: [string, string, boolean][] = [
    ["Health check", h.verdict, h.verdict === "ON TRACK"],
    ["Safety switch", b.live?.halted ? "TRIPPED" : `armed · ${room.toFixed(0)}% room`, !b.live?.halted],
    ["News brake", nb.on ? "ON · no new buys" : "off", !nb.on],
    ["Market weather", b.market?.btc_above_200 === false ? "BTC below 200-day" : "BTC above 200-day", b.market?.btc_above_200 !== false],
    ["Price cross-check", "Binance vs Hyperliquid", true],
    ["Watchdog", "every 15 min", true],
  ];
  return (
    <Card>
      <p className="label pb-2">Systems</p>
      {rows.map(([k, v, ok]) => (
        <div key={k} className="flex items-center justify-between gap-3 border-t border-[#14243a] py-2 text-[12px]">
          <span className="flex items-center gap-2 text-[#a9bbd3]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ok ? CYAN : YELLOW, boxShadow: `0 0 8px ${ok ? CYAN : YELLOW}` }} />{k}
          </span>
          <b className="text-right" style={{ color: ok ? CYAN : YELLOW }}>{v}</b>
        </div>
      ))}
      {b.live?.error && <p className="mt-2 text-[11px] text-[var(--yellow)]">{b.live.error}</p>}
    </Card>
  );
}
