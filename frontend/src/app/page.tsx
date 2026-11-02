"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, type BotStats, type BotStatus } from "@/lib/api";
import { CYAN, GREEN, RED, YELLOW, usd, pct, price, tone } from "@/lib/stats";
import { Loading, Panel } from "@/components/Panel";

const REFRESH_MS = 60_000;
const STALE_MS = 30 * 60_000; // backend refreshes every 5 min, so 30 min without news = stopped
const INK = "#a9bbd3";
type Ready = Extract<BotStatus, { ready: true }>;

const STATUS: Record<string, { label: string; color: string; hint: string }> = {
  "IN TRADE": { label: "IN TRADE", color: CYAN, hint: "The bot holds this coin" },
  SELL: { label: "SELL", color: YELLOW, hint: "Trend broke, sells at the next daily open" },
  BUY: { label: "BUY", color: CYAN, hint: "All five green, buys at the next check" },
  READY: { label: "READY", color: YELLOW, hint: "All five green, but the bot's slots are full" },
  WATCHING: { label: "WATCHING", color: INK, hint: "Not all five dots green yet" },
};

export default function Home() {
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.bot().then(
        (b) => !cancelled && (setBot(b), setErr(null)),
        (e) => !cancelled && setErr(String(e)),
      );
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div id="home" className="mx-auto max-w-[640px] space-y-3.5 px-4 pb-24 pt-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="display text-[20px] font-bold tracking-[2px]">SIX<span className="text-[var(--cyan)]">/</span>DOT</h1>
        <SystemStatus bot={bot} err={err} />
      </header>

      {err && <p className="border border-[var(--yellow)] px-3 py-2 text-[12px] text-[var(--yellow)]">Can&apos;t reach the bot: {err}</p>}

      {!bot || !bot.ready ? (
        <Panel title="Starting up" sub={bot && !bot.ready ? bot.message : "Connecting to the bot"}>
          <Loading h={240} />
        </Panel>
      ) : (
        <Body b={bot} />
      )}

      <footer className="pb-2 text-center text-[10px] uppercase tracking-widest text-white/50">
        Live trading on Hyperliquid · track record uses past prices, not a promise of future returns · not financial advice
      </footer>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[#090d16] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-[640px] grid-cols-4">
          {[["Home", "#home"], ["Radar", "#radar"], ["Trades", "#trades"], ["Safety", "#safety"]].map(([label, href]) => (
            <a key={href} href={href} className="flex h-[56px] items-center justify-center text-[11px] font-bold uppercase tracking-wider text-[#a9bbd3] hover:text-[var(--cyan)]">{label}</a>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SystemStatus({ bot, err }: { bot: BotStatus | null; err: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  let color = YELLOW, label = "CONNECTING";
  if (err || (bot?.ready && now - bot.updated_at * 1000 > STALE_MS)) {
    [color, label] = [RED, "OFFLINE"];
  } else if (bot?.ready && bot.live?.halted) {
    [color, label] = [RED, "STOPPED"];
  } else if (bot?.ready) {
    const mins = Math.max(0, Math.round((now - bot.updated_at * 1000) / 60_000));
    [color, label] = [CYAN, `ONLINE · ${mins ? `${mins} MIN AGO` : "JUST NOW"}`];
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[#a9bbd3]">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />{label}
    </div>
  );
}

function Body({ b }: { b: Ready }) {
  const t = b.backtest;
  return (
    <>
      <Hero b={b} />
      <Mission b={b} />
      <Radar b={b} />
      <Versus b={b} />
      <section id="trades" className="card">
        <p className="label mb-2">Latest real trades</p>
        <Activity b={b} />
      </section>
      <SafetyPanel b={b} />

      <Details title="All coins" hint="Every dot for all the coins it can trade">
        <Scanner b={b} />
      </Details>
      <Details title={`Track record since ${t.start_date}`} hint={`Same rules on past prices: $${b.capital} would be ${usd(t.bot.end)} vs ${usd(t.hold_btc.end)} holding Bitcoin`}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Result label="Six-dot bot" s={t.bot} color={CYAN} big />
            <Result label="Just hold Bitcoin" s={t.hold_btc} color={YELLOW} />
            <Result label="Bitcoin 200-day rule" s={t.rule_200} color={INK} />
          </div>
          <div>
            <div className="h-[220px]">
              <EquityChart curves={[
                { pts: t.curves.hold_btc, color: YELLOW, label: "Hold BTC" },
                { pts: t.curves.rule_200, color: INK, label: "200-day rule" },
                { pts: t.curves.bot, color: CYAN, label: "Bot" },
              ]} />
            </div>
            <YearTable t={t} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-white/60">Past prices, not a promise. Coin list is today&apos;s, so coins that collapsed are missing.</p>
      </Details>
    </>
  );
}

/** The coin the ring shows: the first one held, else the closest to a buy. */
function radarRows(b: Ready) {
  const held = new Set(Object.entries(b.live?.holdings ?? {}).filter(([, v]) => v >= 10).map(([c]) => c));
  return [...b.scanner]
    .map((r) => ({ ...r, held: held.has(r.coin) }))
    .sort((x, y) => Number(y.held) - Number(x.held) || y.green - x.green || y.strength - x.strength);
}

function Hero({ b }: { b: Ready }) {
  const l = b.live;
  const lead = radarRows(b)[0];
  const lit = lead?.green ?? 0;
  const total = b.dots.length;
  const seg = (2 * Math.PI * 120) / total;
  const dash = [seg - 8, 8];
  const litDash = Array.from({ length: lit }, () => [seg - 8, 8]).flat().concat(lit < total ? [0, seg * (total - lit)] : []);
  const equity = l?.equity ?? 0;
  const today = l?.day_start != null ? equity - l.day_start : null;
  const since = l?.capital ? (equity / l.capital - 1) * 100 : null;
  const invested = Object.values(l?.holdings ?? {}).some((v) => v >= 10);
  return (
    <section className="relative mx-auto flex h-[320px] w-[320px] items-center justify-center">
      <svg width="320" height="320" viewBox="0 0 320 320" aria-hidden="true" className="absolute inset-0">
        <circle cx="160" cy="160" r="150" fill="none" stroke="#14243a" />
        <circle cx="160" cy="160" r="140" fill="none" stroke="#1e3048" strokeWidth="6" strokeDasharray="1 7" className="ring-ticks" />
        <circle cx="160" cy="160" r="120" fill="none" stroke="#1e3048" strokeWidth="10" strokeDasharray={dash.join(" ")} transform="rotate(-90 160 160)" />
        {lit > 0 && <circle cx="160" cy="160" r="120" fill="none" stroke="var(--cyan)" strokeWidth="10" strokeDasharray={litDash.join(" ")} transform="rotate(-90 160 160)" className="ring-lit" />}
        <circle cx="160" cy="160" r="102" fill="none" stroke="#14243a" />
      </svg>
      <div className="relative flex flex-col items-center gap-1 text-center">
        <p className="label !tracking-[0.18em]">Account value</p>
        <p className="display text-[42px] font-bold leading-tight tabular-nums">{usd(equity, 2)}</p>
        <p className="text-[14px] font-bold tabular-nums" style={{ color: today != null && today < 0 ? YELLOW : today ? CYAN : INK }}>
          {today != null ? `${today < 0 ? "-" : "+"}${usd(Math.abs(today), 2)} TODAY` : invested ? "" : "ALL IN CASH"}
        </p>
        {since != null && <p className="text-[12px] tabular-nums text-[#a9bbd3]">{pct(since, 1)} since start</p>}
        {lead && <p className="text-[11px] text-[#a9bbd3]">{lead.coin}: {lit} of {total} dots</p>}
      </div>
    </section>
  );
}

function Mission({ b }: { b: Ready }) {
  const l = b.live;
  const positions = l?.positions ?? [];
  return (
    <>
      {l?.error && <p className="border border-[var(--red)] px-3 py-2 text-[12px] text-[var(--red)]">{l.error}</p>}
      {l?.mode && l.mode !== "live" && <p className="label !text-[var(--yellow)]">{l.mode === "off" ? "Trading off" : `${l.mode}: no real orders`}</p>}
      {positions.map((p) => {
        const top = Math.max(p.now, p.paid) * 1.05;
        const at = (v: number) => `${Math.min(100, Math.max(0, ((v - p.stop) / (top - p.stop || 1)) * 100))}%`;
        return (
          <section key={p.coin} className="card space-y-3 !border-[var(--cyan)]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-[22px] font-bold">IN {p.coin}</h2>
              <p className="text-[18px] font-bold tabular-nums" style={{ color: p.pnl_pct < 0 ? YELLOW : CYAN }}>{pct(p.pnl_pct, 1)}</p>
            </div>
            <div className="relative h-1.5 bg-[#14243a]" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 bg-[var(--cyan)]" style={{ width: at(p.now) }} />
              <div className="absolute -top-1 h-3.5 w-0.5 bg-white" style={{ left: at(p.paid) }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[#a9bbd3]">
              <div>SELL POINT<div className="mt-1 text-[14px] tabular-nums text-[var(--yellow)]">{price(p.stop)}</div></div>
              <div>PAID<div className="mt-1 text-[14px] tabular-nums text-white">{price(p.paid)}</div></div>
              <div>NOW<div className="mt-1 text-[14px] tabular-nums text-white">{price(p.now)}</div></div>
            </div>
          </section>
        );
      })}
      {b.waiting && (
        <section className="card space-y-2 !border-[var(--yellow)]">
          <h2 className="display text-[22px] font-bold">STANDING BY</h2>
          <p className="text-[13px] leading-relaxed">{b.waiting}</p>
        </section>
      )}
      {l?.orders?.length ? (
        <section className="card">
          <p className="label mb-1">{l.mode === "dry-run" ? "Would place right now" : "Latest orders"}</p>
          {l.orders.map((o, i) => (
            <div key={i} className="flex justify-between text-[12px] tabular-nums">
              <span>{o.side.toUpperCase()} {o.coin}</span>
              <span>{usd(o.usd, 2)}{o.result ? (o.result.ok ? " done" : " not placed") : ""}</span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

function Radar({ b }: { b: Ready }) {
  const rows = radarRows(b).slice(0, 5);
  return (
    <section id="radar" className="card">
      <div className="label flex justify-between pb-1.5"><span>Radar · closest to a buy</span><span>{b.dots.length} dots</span></div>
      {rows.map((r) => {
        const missing = b.dots.filter((d) => !r.dots[d.key]);
        const note = r.held ? "IN TRADE" : !missing.length ? "READY" : missing.length === 1 ? missing[0].label : `${missing.length} missing`;
        return (
          <div key={r.coin} className="flex h-11 items-center gap-3 border-t border-[#14243a]">
            <span className="display w-16 text-[16px] font-semibold">{r.coin}</span>
            <span className="flex grow gap-1.5" role="img" aria-label={`${r.green} of ${b.dots.length} dots`}>
              {b.dots.map((d) => <Dot key={d.key} on={r.dots[d.key]} />)}
            </span>
            <span className="text-right text-[11px] text-[#a9bbd3]">{note}</span>
          </div>
        );
      })}
    </section>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span className="inline-block h-3 w-3 rounded-full border" style={{ background: on ? "var(--cyan)" : "transparent", borderColor: on ? "var(--cyan)" : "#4a6078" }} />;
}

function Versus({ b }: { b: Ready }) {
  const v = b.versus;
  if (!v) return null;
  const gap = v.live_pct - v.test_pct;
  return (
    <section className="card space-y-2.5">
      <p className="label">Live vs backtest · since going live</p>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="display text-[24px] font-bold tabular-nums">{pct(v.live_pct, 1)}</p><p className="label">Real account</p></div>
        <div><p className="display text-[24px] font-bold tabular-nums text-[#a9bbd3]">{pct(v.test_pct, 1)}</p><p className="label">Same rules, tested</p></div>
      </div>
      <p className="text-[12px]" style={{ color: Math.abs(gap) <= 5 ? CYAN : YELLOW }}>
        {Math.abs(gap) <= 5 ? "Close to the tests" : gap > 0 ? `${gap.toFixed(1)} points ahead of the tests` : `${(-gap).toFixed(1)} points behind the tests`}
      </p>
    </section>
  );
}

function Details({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="panel group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span>
          <span className="panel-title">{title}</span>
          <span className="panel-sub block">{hint}</span>
        </span>
        <span className="text-white/40 transition-transform group-open:rotate-180" aria-hidden>▼</span>
      </summary>
      <div className="border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

function Activity({ b }: { b: Ready }) {
  const rows = b.live?.history ?? [];
  if (!rows.length) return <p className="text-[12px] text-white/60">No trades yet.</p>;
  const day = (t: number) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 8).map((r, i) => (
        <li key={i} className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-1.5 last:border-0">
          <span>
            <span className="block text-[12px] font-bold" style={{ color: r.side === "buy" ? CYAN : YELLOW }}>{r.side === "buy" ? "Bought" : "Sold"} {r.coin}</span>
            <span className="block text-[10px] text-white/50 tabular-nums">{usd(r.usd, 2)} at {price(r.price)}</span>
          </span>
          <span className="shrink-0 text-[10px] text-white/40 tabular-nums">{day(r.t)}</span>
        </li>
      ))}
    </ul>
  );
}

function SafetyPanel({ b }: { b: Ready }) {
  const h = b.health, nb = b.news_brake;
  const room = Math.max(0, h.safety_limit_pct - h.drop_now_pct);
  const rows: [string, string, string][] = [
    ["Health", h.verdict, VERDICT[h.verdict]],
    ["Safety switch", b.live?.halted ? "TRIPPED" : `Armed · ${room.toFixed(0)}% room`, b.live?.halted ? RED : CYAN],
    ["News brake", nb.on ? "ON · no new buys" : "Off", nb.on ? YELLOW : CYAN],
    ["Market weather", b.market?.btc_above_200 === false ? "BTC below 200-day · no buys" : "BTC above 200-day · good", b.market?.btc_above_200 === false ? YELLOW : CYAN],
  ];
  return (
    <section id="safety" className="card space-y-2 text-[12px]">
      <p className="label">Safety</p>
      {rows.map(([k, v, c]) => (
        <div key={k} className="flex justify-between gap-3 border-t border-[#14243a] pt-2">
          <span className="text-[#a9bbd3]">{k}</span><b className="text-right" style={{ color: c }}>{v}</b>
        </div>
      ))}
      <p className="text-[#a9bbd3]">{h.note}.</p>
      {nb.on && nb.headlines.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-[#a9bbd3]">
          {nb.headlines.slice(0, 3).map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <a href="/api/bot/tax.csv" className="inline-flex h-11 items-center border border-[var(--line)] px-3 font-bold text-[#a9bbd3] hover:text-white">Download real trade log (CSV)</a>
    </section>
  );
}

function Scanner({ b }: { b: Ready }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-white/40">
            <th className="pb-1.5 pr-2 font-normal">Coin</th>
            <th className="pb-1.5 pr-2 text-right font-normal">Price</th>
            {b.dots.map((d) => (
              <th key={d.key} className="pb-1.5 text-center font-normal" title={d.desc}>{d.label}</th>
            ))}
            <th className="pb-1.5 pl-2 text-right font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {b.scanner.map((r) => {
            const st = STATUS[r.status];
            return (
              <tr key={r.coin} className="border-t border-[var(--line)]">
                <td className="py-1.5 pr-2 font-bold text-white/90">{r.coin}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-white/70">{price(r.price)}</td>
                {b.dots.map((d) => (
                  <td key={d.key} className="py-1.5 text-center">
                    <Dot on={r.dots[d.key]} />
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-right">
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-black" style={{ background: st.color }} title={st.hint}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[9px] leading-relaxed text-white/40">
        {b.dots.map((d) => `${d.label}: ${d.desc.toLowerCase()}`).join(" · ")}. Sells when 2 of Trend, Momentum and Breakout turn red, or a trailing stop is hit.
      </p>
    </div>
  );
}

const VERDICT: Record<string, string> = { "ON TRACK": GREEN, WATCH: YELLOW, WARNING: RED, STOPPED: RED };

function Result({ label, s, color, big }: { label: string; s: BotStats; color: string; big?: boolean }) {
  return (
    <div className="rounded border bg-black/30 px-2.5 py-2" style={{ borderColor: big ? color : "var(--line)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        <span className={`${big ? "text-[22px]" : "text-[15px]"} font-bold tabular-nums text-white`}>{usd(s.end)}</span>
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-white/55">
        <span>{pct(s.return_pct, 0)}</span>
        <span>worst drop <span style={{ color: RED }}>-{s.worst_drop_pct.toFixed(0)}%</span></span>
      </div>
      {s.trades != null && (
        <div className="mt-0.5 text-[10px] text-white/45">
          {s.trades} trades · {s.trades_per_month?.toFixed(1)} a month · {s.win_rate_pct?.toFixed(0)}% winners
        </div>
      )}
    </div>
  );
}

function YearTable({ t }: { t: Ready["backtest"] }) {
  const rows: [string, BotStats, string][] = [["Bot", t.bot, GREEN], ["Hold BTC", t.hold_btc, YELLOW], ["200-day", t.rule_200, CYAN]];
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[10px] tabular-nums">
        <thead>
          <tr className="text-white/40">
            <th className="text-left font-normal">Year</th>
            {t.bot.yearly.map((y) => <th key={y.year} className="text-right font-normal">{y.year}</th>)}
            {Object.keys(t.windows).map((w) => <th key={w} className="text-right font-normal">Last {w}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, s, c]) => (
            <tr key={label}>
              <td className="font-bold" style={{ color: c }}>{label}</td>
              {s.yearly.map((y) => <td key={y.year} className="text-right" style={{ color: tone(y.return_pct) }}>{pct(y.return_pct, 0)}</td>)}
              {Object.entries(t.windows).map(([w, v]) => {
                const x = label === "Bot" ? v.bot : label === "Hold BTC" ? v.hold_btc : null;
                return <td key={w} className="text-right" style={{ color: tone(x) }}>{x == null ? "" : pct(x, 0)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquityChart({ curves }: { curves: { pts: [number, number][]; color: string; label: string }[] }) {
  const W = 900, H = 260, pad = 34;
  const all = curves.flatMap((c) => c.pts);
  if (!all.length) return null;
  const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
  const lo = Math.log(Math.min(...all.map((p) => p[1]))), hi = Math.log(Math.max(...all.map((p) => p[1])));
  const x = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad - 8);
  const y = (v: number) => 8 + (1 - (Math.log(v) - lo) / (hi - lo || 1)) * (H - 26);
  const ticks = [100, 200, 500, 1000, 2000].filter((v) => Math.log(v) >= lo && Math.log(v) <= hi);
  const years = Array.from(new Set(all.map((p) => new Date(p[0]).getUTCFullYear())));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Account value over time: bot, hold Bitcoin and 200-day rule">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad} x2={W} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />
          <text x={2} y={y(v) + 3} fontSize={9} fill="rgba(255,255,255,0.4)">${v}</text>
        </g>
      ))}
      {years.map((yr) => {
        const tx = x(Date.UTC(yr, 0, 1));
        return tx >= pad ? <text key={yr} x={tx} y={H - 4} fontSize={9} fill="rgba(255,255,255,0.4)">{yr}</text> : null;
      })}
      {curves.map((c) => (
        <polyline key={c.label} fill="none" stroke={c.color} strokeWidth={c.label === "Bot" ? 2 : 1.2} opacity={c.label === "Bot" ? 1 : 0.75}
          points={c.pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} />
      ))}
      {curves.map((c, i) => (
        <text key={c.label} x={pad + 6 + i * 90} y={18} fontSize={10} fontWeight="bold" fill={c.color}>{c.label}</text>
      ))}
    </svg>
  );
}

