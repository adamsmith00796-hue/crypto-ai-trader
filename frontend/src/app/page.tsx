"use client";

import { useEffect, useState, type ReactNode } from "react";
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
    <div className="mx-auto max-w-[1500px] space-y-2 p-2 sm:p-3">
      <header className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--green)] text-xs font-black text-black">6●</div>
          <div>
            <h1 className="text-[15px] font-bold tracking-wide">
              Six-Dot Bot <span className="text-[var(--green)]">{bot?.ready && bot.live?.mode === "live" ? "// LIVE TRADING" : "// PAPER TRADING"}</span>
            </h1>
            <p className="panel-sub">{bot?.ready && bot.live?.mode === "live" ? "Real money on Hyperliquid spot · runs 24/7 on the server" : "Pretend money · runs 24/7 on the server · Hyperliquid spot"}</p>
          </div>
        </div>
        <StatusLight bot={bot} err={err} />
        <div className="flex items-center gap-4 text-[10px]">
          {bot?.ready && (
            <span className="text-white/50">
              Last daily close {bot.last_candle} · {bot.coins_scanned} coins scanned
            </span>
          )}
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

const STALE_MS = 30 * 60_000; // backend refreshes every 5 min, so 30 min without news = stopped

function StatusLight({ bot, err }: { bot: BotStatus | null; err: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  let color = YELLOW, label = "CONNECTING", detail = "Waiting for the bot", flash = false;
  if (err || (bot?.ready && now - bot.updated_at * 1000 > STALE_MS)) {
    [color, label, detail, flash] = [RED, "BOT OFFLINE", "Not updating, the backend needs restarting", true];
  } else if (bot?.ready && bot.paper.halted) {
    [color, label, detail, flash] = [RED, "STOPPED", `Safety switch tripped on ${bot.paper.halted}, trading paused`, true];
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
      <LivePanel b={b} />
      <Overview b={b} />
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Panel title="Holding now" sub="Both pots · profit or loss since each buy">
          <Holdings b={b} />
        </Panel>
        <Panel title="Latest activity" sub="Buys and sells, newest first · you also get these on Telegram">
          <Activity b={b} />
        </Panel>
      </div>
      <SafetyLine b={b} />

      <p className="px-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-white/40">Details</p>
      <Details title="Six-dot scanner" hint="The six checks for each coin, live">
        <Scanner b={b} />
      </Details>
      <Details title="🚀 Moonshot watch list" hint="Which small coins are close to a breakout">
        <MoonshotPanel b={b} />
      </Details>
      <Details title="Safety and tax log" hint="Safety switch, news brake, download every trade">
        <Safeguards b={b} />
      </Details>
      <Details title={`Track record since ${t.start_date}`} hint={`Same rules on past prices: $${b.capital} would be ${usd(t.bot.end)} vs ${usd(t.hold_btc.end)} holding Bitcoin`}>
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="space-y-1.5">
            <Result label="Six-dot bot" s={t.bot} color={GREEN} big />
            <Result label="Just hold Bitcoin" s={t.hold_btc} color={YELLOW} />
            <Result label="Bitcoin 200-day rule" s={t.rule_200} color={CYAN} />
          </div>
          <div>
            <div className="h-[220px]">
              <EquityChart curves={[
                { pts: t.curves.hold_btc, color: YELLOW, label: "Hold BTC" },
                { pts: t.curves.rule_200, color: CYAN, label: "200-day rule" },
                { pts: t.curves.bot, color: GREEN, label: "Bot" },
              ]} />
            </div>
            <YearTable t={t} />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-white/40">Past prices, not a promise. Coin list is today&apos;s, so coins that collapsed are missing.</p>
      </Details>
    </>
  );
}

const LIVE_LABEL: Record<string, [string, string]> = {
  "dry-run": ["DRY RUN · NO ORDERS", CYAN], testnet: ["TESTNET", YELLOW], live: ["LIVE · REAL MONEY", GREEN],
};

function LivePanel({ b }: { b: Ready }) {
  const l = b.live;
  if (!l || l.mode === "off") return null;
  const [label, color] = LIVE_LABEL[l.mode];
  const holdings = Object.entries(l.holdings ?? {}).filter(([, v]) => v >= 1).sort((x, y) => y[1] - x[1]);
  return (
    <section className="panel p-4" style={{ borderColor: color }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="panel-sub !mt-0">Real Hyperliquid account{l.started ? ` · live since ${l.started}` : ""}</p>
          <p className="text-[32px] font-bold leading-none tabular-nums text-white">{usd(l.equity ?? 0, 2)}</p>
          <p className="text-[11px] text-white/50">Cash (USDC) {usd(l.usdc ?? 0, 2)}</p>
        </div>
        <span className="rounded px-2 py-1 text-[11px] font-black tracking-wider text-black" style={{ background: color }}>{label}</span>
      </div>
      <div className="mt-3 grid gap-3 text-[12px] sm:grid-cols-2">
        <div>
          <p className="panel-sub mb-1">Holding</p>
          {holdings.length ? holdings.map(([c, v]) => (
            <div key={c} className="flex justify-between tabular-nums"><span className="font-bold">{c}</span><span>{usd(v, 2)}</span></div>
          )) : <p className="text-white/50">Only cash so far</p>}
        </div>
        <div>
          <p className="panel-sub mb-1">{l.mode === "dry-run" ? "Would place right now" : "Latest orders"}</p>
          {l.orders?.length ? l.orders.map((o, i) => (
            <div key={i} className="flex justify-between tabular-nums">
              <span style={{ color: o.side === "buy" ? GREEN : RED }}>{o.side.toUpperCase()} {o.coin}</span>
              <span>{usd(o.usd, 2)}{o.result ? (o.result.ok ? " ✓" : " ✗") : ""}</span>
            </div>
          )) : <p className="text-white/50">Nothing, already matches the rules</p>}
        </div>
      </div>
      {l.error && <p className="mt-2 text-[11px] text-[var(--red)]">⚠ {l.error}</p>}
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

function Overview({ b }: { b: Ready }) {
  const p = b.paper, m = b.moonshot;
  const main = p.stats?.end ?? b.capital, moon = m.stats?.end ?? m.capital;
  const start = b.capital + m.capital, total = main + moon, change = total - start;
  const next = [...p.pending, ...m.pending];
  return (
    <section className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div>
        <p className="panel-sub !mt-0">Paper test account · pretend money, same rules · started {p.start_date}</p>
        <p className="glow-green text-[44px] font-bold leading-none tabular-nums sm:text-[56px]" style={{ color: tone(change) }}>{usd(total, 2)}</p>
        <p className="mt-1 text-[14px] font-bold tabular-nums" style={{ color: tone(change) }}>
          {change >= 0 ? "+" : "-"}{usd(Math.abs(change), 2)} ({pct((change / start) * 100)})
        </p>
        {next.length > 0 && <p className="mt-1 text-[11px] text-[var(--cyan)]">Next daily open (10am): {next.map((x) => `${x.action} ${x.coin}`).join(", ")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] sm:w-[300px]">
        <Pot label="Main bot" value={main} start={b.capital} />
        <Pot label="🚀 Moonshot" value={moon} start={m.capital} />
      </div>
    </section>
  );
}

function Pot({ label, value, start }: { label: string; value: number; start: number }) {
  return (
    <div className="rounded border border-[var(--line)] bg-black/30 px-2.5 py-2">
      <div className="panel-sub !mt-0">{label}</div>
      <div className="text-[16px] font-bold tabular-nums text-white">{usd(value, 0)}</div>
      <div className="tabular-nums" style={{ color: tone(value - start) }}>{pct(((value - start) / start) * 100, 1)}</div>
    </div>
  );
}

function Holdings({ b }: { b: Ready }) {
  const rows = [...b.paper.positions, ...b.moonshot.positions].sort((x, y) => y.value - x.value);
  if (!rows.length) return <p className="text-[12px] text-white/60">Nothing right now. The bot is holding cash until its rules say buy.</p>;
  const cash = b.paper.cash + b.moonshot.cash;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.coin}-${r.sleeve}-${i}`} className="flex items-center justify-between gap-2 rounded border border-[var(--line)] bg-black/20 px-2.5 py-2">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-bold">{r.coin}</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-white/60">{r.sleeve === "moonshot" ? "🚀 MOON" : "MAIN"}</span>
          </span>
          <span className="text-right tabular-nums">
            <span className="block text-[13px] text-white">{usd(r.value, 2)}</span>
            <span className="block text-[11px] font-bold" style={{ color: tone(r.pnl) }}>{pct(r.pnl_pct, 1)}</span>
          </span>
        </li>
      ))}
      {cash >= 1 && <li className="flex justify-between px-2.5 pt-1 text-[11px] text-white/50"><span>Cash waiting</span><span className="tabular-nums">{usd(cash, 2)}</span></li>}
    </ul>
  );
}

function Activity({ b }: { b: Ready }) {
  type Row = { date: string; text: string; color: string; sub: string };
  const tag = (s: string) => (s === "moonshot" ? " 🚀" : "");
  const rows: Row[] = [];
  for (const t of [...b.paper.trades, ...b.moonshot.trades]) {
    rows.push({ date: t.exit_date, text: `Sold ${t.coin}${tag(t.sleeve)}`, color: tone(t.pnl), sub: `${usd(t.pnl, 2).replace("$-", "-$")} (${pct(t.pnl_pct, 1)}) · ${t.reason.toLowerCase()}` });
    rows.push({ date: t.entry_date, text: `Bought ${t.coin}${tag(t.sleeve)}`, color: CYAN, sub: `${usd(t.cost, 2)} at ${price(t.entry_price)}` });
  }
  for (const p of [...b.paper.positions, ...b.moonshot.positions]) {
    rows.push({ date: p.entry_date, text: `Bought ${p.coin}${tag(p.sleeve)}`, color: CYAN, sub: `${usd(p.cost, 2)} at ${price(p.entry_price)}` });
  }
  rows.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  if (!rows.length) return <p className="text-[12px] text-white/60">No trades yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 8).map((r, i) => (
        <li key={i} className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-1.5 last:border-0">
          <span>
            <span className="block text-[12px] font-bold" style={{ color: r.color }}>{r.text}</span>
            <span className="block text-[10px] text-white/50 tabular-nums">{r.sub}</span>
          </span>
          <span className="shrink-0 text-[10px] text-white/40 tabular-nums">{r.date}</span>
        </li>
      ))}
    </ul>
  );
}

function SafetyLine({ b }: { b: Ready }) {
  const h = b.health, nb = b.news_brake;
  const chips: [string, string, string][] = [
    ["Health", h.verdict, VERDICT[h.verdict]],
    ["Safety switch", b.paper.halted ? "TRIPPED" : `armed · ${Math.max(0, h.safety_limit_pct - h.drop_now_pct).toFixed(0)}% room`, b.paper.halted ? RED : GREEN],
    ["News brake", nb.on ? "ON · no new buys today" : "off", nb.on ? YELLOW : GREEN],
    ["Moonshot buying", b.moonshot.btc_uptrend ? "allowed" : "paused (BTC falling)", b.moonshot.btc_uptrend ? GREEN : YELLOW],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(([k, v, c]) => (
        <span key={k} className="rounded-full border px-2.5 py-1 text-[10px]" style={{ borderColor: `${c}66` }}>
          <span className="text-white/50">{k}: </span><b style={{ color: c }}>{v}</b>
        </span>
      ))}
    </div>
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

function MoonshotPanel({ b }: { b: Ready }) {
  const m = b.moonshot, r = m.rules;
  const value = m.stats?.end ?? m.capital;
  return (
    <Panel title="🚀 Moonshot pot · high risk" sub={`$${m.capital} of pretend money · ${m.started ? "started" : "starts"} ${m.start_date} · small Hyperliquid coins · can go to zero`}
      right={<span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-black" style={{ background: m.btc_uptrend ? GREEN : RED }}>
        {m.btc_uptrend ? "BTC UPTREND · BUYING ALLOWED" : "BTC DOWNTREND · NO NEW BUYS"}</span>}>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr]">
        <div className="space-y-1">
          <p className="panel-sub">Pot value</p>
          <p className="text-[28px] font-bold leading-none tabular-nums" style={{ color: tone(value - m.capital) }}>{usd(value, 2)}</p>
          <p className="text-[11px] tabular-nums" style={{ color: tone(value - m.capital) }}>{pct(((value - m.capital) / m.capital) * 100)}</p>
          <p className="pt-1 text-[9px] leading-relaxed text-white/45">
            Buys a new 20-day high on 2x volume while Bitcoin is rising. Up to {r.slots} bets. Sells at -{r.stop_pct.toFixed(0)}%,
            on a close {r.trail_pct.toFixed(0)}% below its peak{r.take_half_pct > 0 ? `, half at +${r.take_half_pct.toFixed(0)}%` : " (winners are left to run)"}, or after {r.time_stop_days} days if not up 10%.
          </p>
        </div>
        <div>
          <p className="panel-sub mb-1">Watching</p>
          <table className="w-full text-[11px] tabular-nums">
            <tbody>
              {m.watch.map((w) => (
                <tr key={w.coin} className="border-t border-[var(--line)]">
                  <td className="py-1 font-bold">{w.coin}</td>
                  <td className="py-1 text-right text-white/70">{price(w.price)}</td>
                  <td className="py-1 text-right text-white/50" title="How far below its 20-day high">
                    {w.to_breakout_pct == null ? "--" : w.to_breakout_pct <= 0 ? "at high" : `${w.to_breakout_pct.toFixed(1)}% below high`}
                  </td>
                  <td className="py-1 pl-2 text-right">
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-black"
                      style={{ background: w.status === "IN TRADE" ? GREEN : w.status === "BUY" ? CYAN : "rgba(255,255,255,0.4)" }}>{w.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          <p className="panel-sub">Breakouts on coins Hyperliquid doesn&apos;t list · {m.elsewhere.day} · alert only</p>
          {m.elsewhere.breakouts.length ? (
            <div className="flex flex-wrap gap-1">
              {m.elsewhere.breakouts.map((h) => (
                <span key={h.coin} className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] tabular-nums" title={`Closed ${price(h.close)}, ${h.volume_x}x volume, hard stop ${price(h.stop)}`}>
                  <b>{h.coin}</b> <span style={{ color: tone(h.gain_1d_pct) }}>{pct(h.gain_1d_pct, 0)}</span>
                </span>
              ))}
            </div>
          ) : <p className="text-[11px] text-white/50">None on the last daily close</p>}
          {m.elsewhere.early.length > 0 && (
            <>
              <p className="panel-sub">Breaking out today · not confirmed until the daily close</p>
              <div className="flex flex-wrap gap-1">
                {m.elsewhere.early.map((h) => (
                  <span key={h.coin} className="rounded border border-dashed border-[var(--line)] px-1.5 py-0.5 text-[10px] tabular-nums" title={`Now ${price(h.close)}, ${h.volume_x}x volume so far, hard stop ${price(h.stop)}`}>
                    <b>{h.coin}</b> <span style={{ color: tone(h.gain_1d_pct) }}>{pct(h.gain_1d_pct, 0)}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          <p className="panel-sub">Bets</p>
          <PositionTable rows={m.positions} />
          {m.trades.length > 0 && <TradeTable rows={m.trades.slice(0, 8)} />}
        </div>
      </div>
    </Panel>
  );
}

const VERDICT: Record<string, string> = { "ON TRACK": GREEN, WATCH: YELLOW, WARNING: RED, STOPPED: RED };

function Safeguards({ b }: { b: Ready }) {
  const h = b.health, nb = b.news_brake;
  const room = Math.max(0, h.safety_limit_pct - h.drop_now_pct);
  return (
    <div className="space-y-1.5 rounded border border-[var(--line)] bg-black/30 p-2 text-[10px] leading-relaxed">
      <div className="flex items-center justify-between">
        <span className="text-white/50">Health check</span>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-black" style={{ background: VERDICT[h.verdict] }}>{h.verdict}</span>
      </div>
      <p className="text-white/70">{h.note}.</p>
      <div className="flex items-center justify-between">
        <span className="text-white/50">Safety switch</span>
        <span className="tabular-nums text-white/70">
          {b.paper.halted ? <b style={{ color: RED }}>TRIPPED</b> : <>armed · sells all at -{h.safety_limit_pct.toFixed(0)}% · now -{h.drop_now_pct.toFixed(1)}% ({room.toFixed(0)}% room)</>}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/50">News brake</span>
        <span className="font-bold" style={{ color: nb.on ? YELLOW : GREEN }}>{nb.on ? "ON · no new buys today" : "off"}</span>
      </div>
      {nb.on && (
        <ul className="list-disc pl-4 text-white/60">
          {nb.headlines.slice(0, 3).map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <a href="/api/bot/tax.csv" className="inline-block rounded border border-[var(--line)] px-2 py-0.5 font-bold text-white/70 hover:text-white">
        ⬇ Download tax log (CSV)
      </a>
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
            <td className="py-1 font-bold">{p.coin} <span className="text-[8px] font-normal text-white/40">{p.sleeve === "core" ? "CORE" : p.sleeve === "moonshot" ? "MOON" : "TOP-10"}</span></td>
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

