"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type BotPosition, type BotStats, type BotStatus, type BotTrade } from "@/lib/api";
import { CYAN, GREEN, RED, YELLOW, usd, pct, price, tone } from "@/lib/stats";
import { Loading, Panel } from "@/components/Panel";

const REFRESH_MS = 60_000;
type Ready = Extract<BotStatus, { ready: true }>;

const STATUS: Record<string, { label: string; color: string; hint: string }> = {
  "IN TRADE": { label: "IN TRADE", color: GREEN, hint: "The bot holds this coin" },
  SELL: { label: "SELL", color: RED, hint: "Trend broke, sells at the next daily open" },
  BUY: { label: "BUY", color: CYAN, hint: "All six green, buys at the next daily open" },
  READY: { label: "READY", color: YELLOW, hint: "All six green, but the bot's slots are full" },
  WATCHING: { label: "WATCHING", color: "rgba(255,255,255,0.4)", hint: "Not all dots green yet" },
};

export default function BotPage() {
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
    <div className="mx-auto max-w-[1500px] space-y-2 p-2 sm:p-3">
      <header className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--green)] text-xs font-black text-black">6●</div>
          <div>
            <h1 className="text-[15px] font-bold tracking-wide">
              Six-Dot Bot <span className="text-[var(--green)]">{"// PAPER TRADING"}</span>
            </h1>
            <p className="panel-sub">Pretend money only · no exchange connected · daily candles · set up for Hyperliquid spot</p>
          </div>
        </div>
        <StatusLight bot={bot} err={err} />
        <div className="flex items-center gap-4 text-[10px]">
          {bot?.ready && (
            <span className="text-white/50">
              Last daily close {bot.last_candle} · {bot.coins_scanned} coins scanned
            </span>
          )}
          <Link href="/" className="rounded border border-[var(--line)] px-2.5 py-1 font-bold text-white/70 hover:text-white">
            ← DASHBOARD
          </Link>
        </div>
      </header>

      {err && <div className="panel px-3 py-1.5 text-[10px] text-[var(--yellow)]">Bot feed failed: {err}</div>}

      {!bot || !bot.ready ? (
        <Panel title="Starting up" sub={bot && !bot.ready ? bot.message : "Connecting to the bot"}>
          <Loading h={240} />
        </Panel>
      ) : (
        <Body b={bot} />
      )}

      <footer className="pb-2 text-center text-[9px] uppercase tracking-widest text-white/35">
        Paper trading · results use past prices and are not a promise of future returns · not financial advice
      </footer>
    </div>
  );
}

const STALE_MS = 45 * 60_000; // backend refreshes every 15 min, so 45 min without news = stopped

function StatusLight({ bot, err }: { bot: BotStatus | null; err: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  let color = YELLOW, label = "CONNECTING", detail = "Waiting for the bot", flash = false;
  if (err || (bot?.ready && now - bot.updated_at * 1000 > STALE_MS)) {
    [color, label, detail, flash] = [RED, "BOT OFFLINE", "Not updating, the backend needs restarting", true];
  } else if (bot?.ready && !bot.paper.started) {
    [color, label, detail] = [YELLOW, "NOT TRADING YET", `Starts after the ${bot.paper.start_date} daily close (10am AEST), first trades show the day after`];
  } else if (bot?.ready && bot.paper.positions.length) {
    const coins = Array.from(new Set(bot.paper.positions.map((p) => p.coin))).join(", ");
    [color, label, detail] = [GREEN, "TRADING", `In ${coins}`];
  } else if (bot?.ready) {
    [color, label, detail] = [RED, "NOT IN A TRADE", "Running, holding cash until all six dots are green"];
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2.5 rounded border px-3 py-1.5" style={{ borderColor: color, background: `${color}14` }}>
      <span className={`h-3.5 w-3.5 rounded-full ${flash ? "animate-pulse" : "live-dot"}`} style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      <div className="leading-tight">
        <div className="text-[14px] font-black tracking-wider" style={{ color }}>{label}</div>
        <div className="text-[9px] text-white/60">{detail}</div>
      </div>
    </div>
  );
}

function Body({ b }: { b: Ready }) {
  const t = b.backtest;
  return (
    <>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="Six-dot scanner" sub="LIVE dots, updated every 5 minutes · the bot acts on them once a day at 10am AEST · a ring means the dot changed since 10am" className="lg:col-span-8">
          <Scanner b={b} />
        </Panel>
        <Panel title="Paper account" sub={`$${b.capital} of pretend money · ${b.paper.started ? "started" : "starts"} ${b.paper.start_date}`} className="lg:col-span-4">
          <PaperAccount b={b} />
        </Panel>
      </div>

      <Panel title={`Track record since ${t.start_date}`} sub={`Same rules run on past prices · $${b.capital} start · ${b.cost_per_side_pct.toFixed(2)}% fees and slippage per trade`}>
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="space-y-1.5">
            <Result label="Six-dot bot" s={t.bot} color={GREEN} big />
            <Result label="Just hold Bitcoin" s={t.hold_btc} color={YELLOW} />
            <Result label="Bitcoin 200-day rule" s={t.rule_200} color={CYAN} />
          </div>
          <div>
            <div className="h-[260px]">
              <EquityChart curves={[
                { pts: t.curves.hold_btc, color: YELLOW, label: "Hold BTC" },
                { pts: t.curves.rule_200, color: CYAN, label: "200-day rule" },
                { pts: t.curves.bot, color: GREEN, label: "Bot" },
              ]} />
            </div>
            <YearTable t={t} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="What the bot would hold today" sub="If it had been running since 2021" className="lg:col-span-5">
          <PositionTable rows={t.positions} />
        </Panel>
        <Panel title="Recent trades" sub="From the track record · most recent first" className="lg:col-span-7">
          <TradeTable rows={t.recent_trades} />
        </Panel>
      </div>
    </>
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
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      title={`${d.label}: ${d.desc}${r.dots[d.key] !== r.dots_at_close[d.key] ? ` (was ${r.dots_at_close[d.key] ? "green" : "red"} at 10am)` : ""}`}
                      aria-label={`${d.label} ${r.dots[d.key] ? "green" : "red"} now`}
                      style={{
                        background: r.dots[d.key] ? GREEN : RED,
                        boxShadow: `0 0 6px ${r.dots[d.key] ? GREEN : RED}`,
                        outline: r.dots[d.key] !== r.dots_at_close[d.key] ? `2px solid ${YELLOW}` : undefined,
                        outlineOffset: 2,
                      }}
                    />
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

function PaperAccount({ b }: { b: Ready }) {
  const p = b.paper;
  const value = p.stats?.end ?? b.capital;
  return (
    <div className="space-y-3">
      <div>
        <p className="panel-sub">Account value</p>
        <p className="glow-green text-[34px] font-bold leading-none tabular-nums" style={{ color: tone(value - b.capital) }}>{usd(value, 2)}</p>
        <p className="mt-1 text-[11px] tabular-nums" style={{ color: tone(value - b.capital) }}>
          {pct(((value - b.capital) / b.capital) * 100)} since {p.start_date}
        </p>
      </div>
      {!p.started ? (
        <p className="rounded border border-[var(--line)] bg-black/30 p-2 text-[11px] leading-relaxed text-white/70">
          The paper account starts with the next daily close (10am AEST). Coins marked BUY or READY in the scanner will be bought at the open after that, up to the bot&apos;s {b.sleeves.reduce((n, s) => n + s.slots, 0)} slots.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Box k="Trades" v={String(p.stats?.trades ?? 0)} />
          <Box k="Win rate" v={p.stats?.trades ? `${p.stats.win_rate_pct?.toFixed(0)}%` : "--"} />
          <Box k="Cash" v={usd(p.cash)} />
        </div>
      )}
      <div className="space-y-1">
        {b.sleeves.map((s) => (
          <div key={s.key} className="flex justify-between text-[10px] text-white/60">
            <span>{s.label}</span>
            <span className="tabular-nums">{usd(b.capital * s.share)} · up to {s.slots} coin{s.slots > 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
      {p.pending.length > 0 && (
        <p className="text-[10px] text-[var(--cyan)]">
          Next open: {p.pending.map((x) => `${x.action} ${x.coin}`).join(", ")}
        </p>
      )}
      {p.positions.length > 0 && <PositionTable rows={p.positions} />}
      {p.trades.length > 0 && <TradeTable rows={p.trades.slice(0, 10)} />}
    </div>
  );
}

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

function PositionTable({ rows }: { rows: BotPosition[] }) {
  if (!rows.length) return <p className="text-[11px] text-white/50">No open trades.</p>;
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead>
        <tr className="text-left text-[9px] uppercase tracking-wider text-white/40">
          <th className="font-normal">Coin</th><th className="font-normal">Since</th>
          <th className="text-right font-normal">Value</th><th className="text-right font-normal">Stop</th><th className="text-right font-normal">P/L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={`${p.coin}-${p.sleeve}-${i}`} className="border-t border-[var(--line)]">
            <td className="py-1 font-bold">{p.coin} <span className="text-[8px] font-normal text-white/40">{p.sleeve === "core" ? "CORE" : "TOP-10"}</span></td>
            <td className="py-1 text-white/60">{p.entry_date}</td>
            <td className="py-1 text-right">{usd(p.value, 2)}</td>
            <td className="py-1 text-right text-white/60">{price(p.stop)}</td>
            <td className="py-1 text-right" style={{ color: tone(p.pnl) }}>{pct(p.pnl_pct, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TradeTable({ rows }: { rows: BotTrade[] }) {
  if (!rows.length) return <p className="text-[11px] text-white/50">No closed trades yet.</p>;
  return (
    <div className="max-h-[320px] overflow-y-auto">
      <table className="w-full text-[11px] tabular-nums">
        <thead className="sticky top-0 bg-[var(--panel,#0b0f14)]">
          <tr className="text-left text-[9px] uppercase tracking-wider text-white/40">
            <th className="font-normal">Coin</th><th className="font-normal">Bought</th><th className="font-normal">Sold</th>
            <th className="font-normal">Why</th><th className="text-right font-normal">P/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.coin}-${r.exit_date}-${i}`} className="border-t border-[var(--line)]">
              <td className="py-1 font-bold">{r.coin}</td>
              <td className="py-1 text-white/60">{r.entry_date}</td>
              <td className="py-1 text-white/60">{r.exit_date}</td>
              <td className="py-1 text-white/60">{r.reason}</td>
              <td className="py-1 text-right" style={{ color: tone(r.pnl) }}>{usd(r.pnl, 2).replace("$-", "-$")} ({pct(r.pnl_pct, 0)})</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-[var(--line)] bg-black/30 px-2 py-1.5">
      <div className="panel-sub !mt-0">{k}</div>
      <div className="text-[12px] font-bold tabular-nums text-white">{v}</div>
    </div>
  );
}
