"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Field } from "@/components/Field";
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
      <Pipeline b={b} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Account value" value={usd(equity, 2)} big />
        <Kpi label="Today" value={today == null ? "--" : `${today < 0 ? "-" : "+"}${usd(Math.abs(today), 2)}`} color={today != null && today < 0 ? YELLOW : CYAN} />
        <Kpi label="Since start" value={l?.capital ? pct((equity / l.capital - 1) * 100, 1) : "--"} />
        <Kpi label="Cash" value={usd(l?.usdc ?? 0, 0)} />
        <Kpi label="Same rules, tested" value={b.versus ? pct(b.versus.test_pct, 1) : "--"} color={INK} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="relative overflow-hidden !p-0">
          <p className="label absolute left-4 top-3 z-10">Market field · {rows.length} coins · live dots</p>
          <Field coins={rows.map((r) => ({ coin: r.coin, green: r.green, held: r.held }))} total={total} height={600} />
          {lead && <Candidate b={b} row={lead} />}
          <p className="absolute bottom-3 right-4 text-[11px] text-[#a9bbd3]">Brighter, thicker, faster = more dots · gold = held</p>
        </Card>
        <div className="space-y-3">
          <Focus b={b} coin={lead?.coin} />
          <BtcWave b={b} />
          <Closeness b={b} rows={rows} />
          <Telemetry b={b} />
        </div>
      </section>

      <Ticker b={b} />

      <section className="grid gap-3 lg:grid-cols-3">
        <Allocation b={b} />
        <Years b={b} />
        <Results b={b} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Terminal b={b} />
        <div className="space-y-3">
          <Timings b={b} />
          <Matrix b={b} rows={rows} />
          <Systems b={b} />
        </div>
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
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines]);  // the log, never the page
  const stamp = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
  return (
    <Card>
      <p className="label pb-2">Bot log</p>
      <div ref={box} className="h-[260px] overflow-y-auto font-mono text-[12px] leading-relaxed">
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
        <div className="mt-1 h-4 w-2 animate-pulse bg-[var(--cyan)]" />
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

const STATUS_COLOR = { DONE: CYAN, WAIT: YELLOW, BLOCK: YELLOW } as const;

/** What the bot did on its last run, step by step. */
function Pipeline({ b }: { b: Ready }) {
  const c = b.command;
  if (!c) return null;
  return (
    <section className="flex flex-wrap items-center gap-2" aria-label="Last run, step by step">
      {c.pipeline.map((p, i) => (
        <div key={p.step} className="flex items-center gap-2">
          <div className="border px-2.5 py-1.5 text-[11px]" style={{ borderColor: `${STATUS_COLOR[p.status]}88`, background: `${STATUS_COLOR[p.status]}10` }} title={p.note}>
            <span className="font-bold tracking-wider" style={{ color: STATUS_COLOR[p.status] }}>{p.step.toUpperCase()}</span>
            <span className="ml-2 text-[#a9bbd3]">{p.status === "DONE" ? p.note : `${p.status} · ${p.note}`}</span>
          </div>
          {i < c.pipeline.length - 1 && <span className="text-[#4a6078]" aria-hidden="true">›</span>}
        </div>
      ))}
    </section>
  );
}

/** Callout over the field: the coin closest to a buy, or the one held. */
function Candidate({ b, row }: { b: Ready; row: ReturnType<typeof radarRows>[number] }) {
  const missing = b.dots.filter((d) => !row.dots[d.key]).map((d) => d.label);
  return (
    <div className="absolute bottom-10 left-4 border px-3 py-2 text-[11px]" style={{ borderColor: row.held ? YELLOW : CYAN, background: "rgba(5,7,13,0.75)" }}>
      <p className="font-bold tracking-wider" style={{ color: row.held ? YELLOW : CYAN }}>
        {row.held ? "HOLDING" : "CANDIDATE"} {row.coin} · {row.green}/{b.dots.length} DOTS · {price(row.price)}
      </p>
      <p className="mt-0.5 text-[#a9bbd3]">{missing.length ? `Missing: ${missing.join(", ")}` : "All dots green"}</p>
    </div>
  );
}

/** Bitcoin over the last 48 hours: the market weather the bot checks before any buy. */
function BtcWave({ b }: { b: Ready }) {
  const pts = b.command?.btc_hourly ?? [];
  if (pts.length < 2) return null;
  const ma = b.command?.btc_200d ?? null;
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 400, H = 70;
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
  const line = pts.map((p, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1], first = vals[0];
  return (
    <Card>
      <div className="label flex justify-between"><span>Bitcoin · 48 hours</span><span style={{ color: last >= first ? CYAN : YELLOW }}>{pct((last / first - 1) * 100, 1)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-[70px] w-full" preserveAspectRatio="none" role="img" aria-label="Bitcoin price, last 48 hours">
        <polyline points={line} fill="none" stroke={YELLOW} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[11px] text-[#a9bbd3]">
        {price(last)}{ma ? ` · 200-day average ${price(ma)} · ${last > ma ? "weather good" : "weather bad: no buys"}` : ""}
      </p>
    </Card>
  );
}

/** One bar per coin: how many of the dots are green. */
function Closeness({ b, rows }: { b: Ready; rows: ReturnType<typeof radarRows> }) {
  const total = b.dots.length;
  return (
    <Card>
      <p className="label">Distance to a buy</p>
      <div className="mt-3 flex h-[90px] items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.coin} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full" style={{ height: `${Math.max(6, (r.green / total) * 72)}px`, background: r.held ? YELLOW : r.green >= total - 1 ? CYAN : "#2c4560" }} />
            <span className="text-[9px] text-[#a9bbd3]">{r.coin}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Telemetry({ b }: { b: Ready }) {
  const l = b.live, c = b.command;
  const pos = l?.positions?.[0];
  const up = c ? `${Math.floor(c.uptime_s / 86400)}d ${Math.floor((c.uptime_s % 86400) / 3600)}h` : "--";
  const nextIn = c ? Math.max(0, Math.round((c.next_check_at * 1000 - Date.now()) / 60000)) : null;
  const lastOrder = l?.history?.[0];
  const rows: [string, string, string?][] = [
    ["Equity", usd(l?.equity ?? 0, 2)],
    ["Cash", usd(l?.usdc ?? 0, 2)],
    ...(pos ? [[`${pos.coin} profit/loss`, pct(pos.pnl_pct, 1), pos.pnl_pct < 0 ? YELLOW : CYAN], [`${pos.coin} to sell point`, pct((pos.stop / pos.now - 1) * 100, 1)]] as [string, string, string?][] : []),
    ["Checks today", String(c?.checks_today ?? "--")],
    ["Next check", nextIn == null ? "--" : nextIn ? `in ${nextIn} min` : "now"],
    ["Uptime", up],
    ["Last order", lastOrder ? `${lastOrder.side.toUpperCase()} ${lastOrder.coin} ${new Date(lastOrder.t).toISOString().slice(5, 10)}` : "none"],
  ];
  return (
    <Card>
      <p className="label pb-1">Telemetry</p>
      {rows.map(([k, v, col]) => (
        <div key={k} className="flex justify-between gap-3 py-0.5 font-mono text-[12px]">
          <span className="text-[#a9bbd3]">{k}</span><span className="tabular-nums" style={{ color: col ?? "#e8f1ff" }}>{v}</span>
        </div>
      ))}
    </Card>
  );
}

/** How long each step of the last run took. */
function Timings({ b }: { b: Ready }) {
  const c = b.command;
  if (!c) return null;
  const max = Math.max(...c.pipeline.map((p) => p.ms), 1);
  return (
    <Card>
      <div className="label flex justify-between pb-2"><span>Last run</span><span>{(c.run_ms / 1000).toFixed(1)} s</span></div>
      {c.pipeline.filter((p) => p.ms > 0).map((p) => (
        <div key={p.step} className="flex items-center gap-3 py-1 text-[11px]">
          <span className="w-24 text-[#a9bbd3]">{p.step}</span>
          <span className="h-1.5 grow bg-[#14243a]"><span className="block h-full" style={{ width: `${(p.ms / max) * 100}%`, background: STATUS_COLOR[p.status] }} /></span>
          <span className="w-14 text-right tabular-nums text-[#a9bbd3]">{p.ms < 1000 ? `${p.ms} ms` : `${(p.ms / 1000).toFixed(1)} s`}</span>
        </div>
      ))}
    </Card>
  );
}

/** Every coin's price and its move since yesterday's close, scrolling. */
function Ticker({ b }: { b: Ready }) {
  const items = Object.entries(b.closes ?? {}).map(([coin, pts]) => {
    const now = pts[pts.length - 1]?.[1], prev = pts[pts.length - 2]?.[1];
    return { coin, now, move: now && prev ? (now / prev - 1) * 100 : 0 };
  });
  if (!items.length) return null;
  const row = items.map((x) => (
    <span key={x.coin} className="mx-5 whitespace-nowrap">
      <b className="text-white">{x.coin}</b> <span className="text-[#a9bbd3]">{price(x.now)}</span>{" "}
      <span style={{ color: x.move >= 0 ? CYAN : YELLOW }}>{pct(x.move, 1)}</span>
    </span>
  ));
  return (
    <section className="overflow-hidden border border-[var(--line)] py-2 font-mono text-[12px]" aria-label="Coin prices">
      <div className="ticker flex w-max">{row}{row}</div>
    </section>
  );
}

/** Where the money is right now. */
function Allocation({ b }: { b: Ready }) {
  const l = b.live;
  const parts = [
    ...Object.entries(l?.holdings ?? {}).filter(([, v]) => v >= 1).map(([c, v]) => ({ label: c, v, color: YELLOW })),
    { label: "Cash", v: l?.usdc ?? 0, color: "#2c4560" },
  ];
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1;
  let acc = 0;
  const R = 70, C = 2 * Math.PI * R;
  return (
    <Card>
      <p className="label">Where the money is</p>
      <div className="mt-3 flex items-center gap-5">
        <svg viewBox="0 0 180 180" className="h-[150px] w-[150px] shrink-0" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.v / sum) * 100)}%`).join(", ")}>
          {parts.map((p) => {
            const len = (p.v / sum) * C;
            const el = <circle key={p.label} cx="90" cy="90" r={R} fill="none" stroke={p.color} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)" />;
            acc += len;
            return el;
          })}
          <text x="90" y="86" textAnchor="middle" fontSize="20" fontWeight="700" fill="#e8f1ff">{usd(sum, 0)}</text>
          <text x="90" y="106" textAnchor="middle" fontSize="11" fill="#a9bbd3">TOTAL</text>
        </svg>
        <div className="space-y-1.5 text-[12px]">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5" style={{ background: p.color }} />
              <span className="w-12">{p.label}</span>
              <span className="tabular-nums text-[#a9bbd3]">{usd(p.v, 0)} · {Math.round((p.v / sum) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** The same rules on past prices, year by year, against just holding Bitcoin. */
function Years({ b }: { b: Ready }) {
  const bot = b.backtest.bot.yearly, btc = new Map(b.backtest.hold_btc.yearly.map((y) => [y.year, y.return_pct]));
  const max = Math.max(...bot.map((y) => Math.abs(y.return_pct)), ...Array.from(btc.values()).map(Math.abs), 1);
  return (
    <Card>
      <div className="label flex justify-between"><span>Backtest by year</span><span><span style={{ color: CYAN }}>■</span> bot <span style={{ color: "#4a6078" }}>■</span> hold BTC</span></div>
      <div className="mt-3 space-y-1.5">
        {bot.map((y) => {
          const h = btc.get(y.year) ?? 0;
          return (
            <div key={y.year} className="flex items-center gap-3 text-[11px]">
              <span className="w-10 text-[#a9bbd3]">{y.year}</span>
              <div className="grow space-y-0.5">
                <div className="h-2" style={{ width: `${(Math.abs(y.return_pct) / max) * 100}%`, background: y.return_pct >= 0 ? CYAN : YELLOW }} />
                <div className="h-1" style={{ width: `${(Math.abs(h) / max) * 100}%`, background: "#4a6078" }} />
              </div>
              <span className="w-14 text-right tabular-nums" style={{ color: y.return_pct >= 0 ? CYAN : YELLOW }}>{pct(y.return_pct, 0)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Every finished real trade, best to worst. */
function Results({ b }: { b: Ready }) {
  const trades = [...(b.command?.round_trips ?? [])].sort((x, y) => y.pnl - x.pnl);
  const total = trades.reduce((a, t) => a + t.pnl, 0);
  const max = Math.max(...trades.map((t) => Math.abs(t.pnl)), 1);
  return (
    <Card>
      <div className="label flex justify-between"><span>Real trades · best to worst</span><span style={{ color: total >= 0 ? CYAN : YELLOW }}>{total >= 0 ? "+" : "-"}{usd(Math.abs(total), 2)}</span></div>
      {trades.length ? (
        <div className="mt-3 flex h-[150px] items-center gap-1">
          {trades.map((t, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-center" title={`${t.coin}: ${t.pnl >= 0 ? "+" : "-"}${usd(Math.abs(t.pnl), 2)} (${pct(t.pnl_pct, 1)})`}>
              <div className="flex h-1/2 items-end">{t.pnl >= 0 && <div className="w-full" style={{ height: `${(t.pnl / max) * 100}%`, background: CYAN }} />}</div>
              <div className="flex h-1/2 items-start border-t border-[#2c4560]">{t.pnl < 0 && <div className="w-full" style={{ height: `${(-t.pnl / max) * 100}%`, background: YELLOW }} />}</div>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-[12px] text-[#a9bbd3]">No finished trades yet.</p>}
      <p className="mt-2 text-[11px] text-[#a9bbd3]">{trades.length} finished · {trades.filter((t) => t.pnl > 0).length} winners</p>
    </Card>
  );
}
