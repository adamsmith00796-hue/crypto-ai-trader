"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type HoldingNews, type MarketCoin, type Portfolio, type Sentiment } from "@/lib/api";
import { GREEN, RED, YELLOW, usd, breadthWave, pct, price, returns, timeAgo, tone } from "@/lib/stats";
import { Loading, Panel } from "@/components/Panel";
import { Sparkline } from "@/components/Sparkline";
import { NeuralShell } from "@/components/NeuralShell";
import { AlertBanner, PositionsTable, useGainAlerts } from "@/components/Positions";
import {
  AllocationBars,
  CandleChart,
  Correlation,
  Distribution,
  Gauge,
  HeatGrid,
  MoverScatter,
  SentimentBars,
  WaveBand,
} from "@/components/Charts";

const REFRESH_MS = 30_000;

type State = {
  portfolio: Portfolio | null;
  sentiment: Sentiment | null;
  market: MarketCoin[] | null;
  myNews: HoldingNews[] | null;
  errors: string[];
  updated: Date | null;
};

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Home() {
  const [s, setS] = useState<State>({ portfolio: null, sentiment: null, market: null, myNews: null, errors: [], updated: null });
  const now = useClock();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await Promise.allSettled([api.portfolio(), api.sentiment(), api.market(), api.holdingsNews()]);
      if (cancelled) return;
      const errors: string[] = [];
      const pick = <T,>(x: PromiseSettledResult<T>, name: string): T | null => {
        if (x.status === "fulfilled") return x.value;
        errors.push(`${name}: ${x.reason}`);
        return null;
      };
      setS((prev) => ({
        // keep last good data if a refresh fails
        portfolio: pick(r[0], "portfolio") ?? prev.portfolio,
        sentiment: pick(r[1], "sentiment") ?? prev.sentiment,
        market: pick(r[2], "market") ?? prev.market,
        myNews: pick(r[3], "my-coin news") ?? prev.myNews,
        errors,
        updated: new Date(),
      }));
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const { market, portfolio, sentiment, myNews } = s;
  const target = portfolio?.alert_gain_pct ?? 200;
  const alerts = useGainAlerts(portfolio?.positions, target);
  const [newsFilter, setNewsFilter] = useState<string>("ALL");
  const [openStory, setOpenStory] = useState<string | null>(null);
  const btc = market?.find((c) => c.id === "bitcoin");
  const wave = useMemo(() => (market ? breadthWave(market) : []), [market]);
  const stats = useMemo(() => {
    if (!market?.length) return null;
    const withChg = market.filter((c) => c.change_24h_pct != null);
    const sorted = [...withChg].sort((a, b) => (b.change_24h_pct as number) - (a.change_24h_pct as number));
    const up = withChg.filter((c) => (c.change_24h_pct as number) >= 0).length;
    return {
      top: sorted[0],
      bottom: sorted[sorted.length - 1],
      breadth: withChg.length ? (up / withChg.length) * 100 : 0,
      cap: market.reduce((sum, c) => sum + c.market_cap, 0),
    };
  }, [market]);

  const pf = useMemo(() => {
    if (!portfolio || !market) return null;
    const chg = new Map(market.map((c) => [c.symbol.toUpperCase(), c.change_24h_pct ?? 0]));
    const delta = portfolio.holdings.reduce((sum, h) => {
      const c = chg.get(h.symbol.toUpperCase()) ?? 0;
      return sum + h.value - h.value / (1 + c / 100);
    }, 0);
    const agg = aggregate(portfolio);
    return { delta, pct: (delta / (portfolio.total_value - delta)) * 100, top: agg[0] };
  }, [portfolio, market]);

  const utc = now ? now.toISOString().slice(11, 19) : "--:--:--";
  const tickerItems = [
    ...(market ?? []).map((c) => ({ k: c.id, text: `${c.symbol} ${price(c.price)}`, extra: pct(c.change_24h_pct, 1), color: tone(c.change_24h_pct) })),
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-2 p-2 sm:p-3">
      {/* header */}
      <header className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--cyan)] text-xs font-black text-black">CH</div>
          <div>
            <h1 className="text-[15px] font-bold tracking-wide">
              Crypto Info Hub <span className="text-[var(--cyan)]">// MARKET TERMINAL</span>
            </h1>
            <p className="panel-sub">Info only · no trading · {market?.length ?? 0} coins held · USD</p>
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-right">
          <Stat k="BTC" v={btc ? price(btc.price) : "--"} c={tone(btc?.change_24h_pct)} />
          <Stat k="24H" v={pct(btc?.change_24h_pct)} c={tone(btc?.change_24h_pct)} />
          <Stat k="FEAR/GREED" v={sentiment ? String(sentiment.value) : "--"} c={YELLOW} />
          <Stat k="BREADTH" v={stats ? `${stats.breadth.toFixed(0)}% UP` : "--"} c={stats && stats.breadth >= 50 ? GREEN : RED} />
          <Stat k="PORTFOLIO" v={portfolio ? usd(portfolio.total_value) : "--"} c="#fff" />
          <Link href="/bot" className="rounded bg-[var(--green)] px-2.5 py-1 text-[10px] font-bold text-black hover:brightness-110">
            6-DOT BOT →
          </Link>
          <div className="text-[18px] font-bold tabular-nums">
            {utc} <span className="text-[9px] text-white/40">UTC</span>
          </div>
        </dl>
      </header>

      {/* live feed strip */}
      <div className="panel flex items-center overflow-hidden text-[10px]" aria-label="Live prices for the coins you hold">
        <span className="z-10 flex items-center gap-1.5 bg-[var(--red)] px-2.5 py-1.5 font-bold text-white">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
          LIVE FEED
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="marquee flex w-max gap-8 whitespace-nowrap py-1.5 pl-4">
            {[...tickerItems, ...tickerItems].map((t, i) => (
              <span key={`${t.k}-${i}`} className="text-white/70">
                {t.text} <span style={{ color: t.color }}>{t.extra}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {s.errors.length > 0 && (
        <div className="panel px-3 py-1.5 text-[10px] text-[var(--yellow)]">Some feeds failed, showing last good data: {s.errors.join(" · ")}</div>
      )}

      {portfolio?.positions && <AlertBanner positions={portfolio.positions} target={target} perm={alerts.perm} enable={alerts.enable} />}

      {/* row 1 */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="Portfolio" sub={portfolio?.using_example_data ? "EXAMPLE DATA · add config/portfolio.json" : portfolio?.connections?.coinspot?.connected ? "Live · CoinSpot connected" : "Live valuation · manual holdings"} className="lg:col-span-3"
          right={portfolio?.using_example_data ? <span className="rounded bg-[var(--yellow)] px-1.5 py-0.5 text-[8px] font-bold text-black">EXAMPLE</span> : undefined}>
          {portfolio ? (
            <>
              <p className="panel-sub">Total value</p>
              <p className="glow-green text-[34px] font-bold leading-none tabular-nums text-[var(--green)]">{usd(portfolio.total_value)}</p>
              <div className="mt-3">
                <AllocationBars items={aggregate(portfolio)} />
              </div>
            </>
          ) : (
            <Loading h={180} />
          )}
        </Panel>

        <Panel title="BTC · 7 day" sub="3-hour candles · CoinGecko" className="lg:col-span-3"
          right={btc && <span className="text-right text-[15px] font-bold tabular-nums" style={{ color: tone(btc.change_24h_pct) }}>{price(btc.price)}<br /><span className="text-[9px]">{pct(btc.change_24h_pct)}</span></span>}>
          <div className="h-[170px]">{btc ? <CandleChart series={btc.sparkline_7d} /> : <Loading h={170} />}</div>
        </Panel>

        <div className="grid gap-2 lg:col-span-6">
          <Panel title="Movers · size vs 24h move" sub="Each dot is a coin, sized by market cap, above the line = up">
            <div className="h-[110px]">{market ? <MoverScatter coins={market} /> : <Loading h={110} />}</div>
          </Panel>
          <Panel title="Heat grid · 24h change" sub="Top 16 by market cap">
            {market ? <HeatGrid coins={market} /> : <Loading h={100} />}
          </Panel>
        </div>
      </div>

      {portfolio?.positions && portfolio.positions.length > 0 && (
        <Panel title="Positions vs your buy price" sub={`Gain since your average buy · alert at +${target}% · edit alert_gain_pct in config/portfolio.json`}
          right={<span className="text-[9px] text-white/40">{portfolio.positions.filter((p) => p.alert).length} OVER TARGET</span>}>
          <PositionsTable positions={portfolio.positions} target={target} />
        </Panel>
      )}

      {/* neural shell */}
      <Panel title="Neural shell" sub="One big cell per coin you hold · size = market cap · green up, red down · drag to rotate" right={<span className="text-[9px] text-white/40">{market?.length ?? 0} CELLS</span>}>
        <div className="grid gap-3 lg:grid-cols-[250px_1fr_230px]">
          <ul className="hidden space-y-1.5 lg:block">
            {(market ?? []).map((c) => (
              <li key={c.id} className="rounded border border-[var(--line)] bg-black/20 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-white/90">{c.symbol} <span className="font-normal tabular-nums text-white/45">{price(c.price)}</span></span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: tone(c.change_24h_pct) }}>{pct(c.change_24h_pct, 1)}</span>
                </div>
                <div className="mt-0.5 h-7"><Sparkline values={c.sparkline_7d} color={tone(c.change_24h_pct)} /></div>
              </li>
            ))}
          </ul>
          <div className="h-[380px] lg:h-[560px]">{market ? <NeuralShell coins={market} /> : <Loading h={380} />}</div>
          <div className="grid grid-cols-2 gap-1.5 self-start lg:grid-cols-1">
            <Box k="Top gainer" v={stats ? `${stats.top.symbol} ${pct(stats.top.change_24h_pct, 1)}` : "--"} c={GREEN} />
            <Box k="Top loser" v={stats ? `${stats.bottom.symbol} ${pct(stats.bottom.change_24h_pct, 1)}` : "--"} c={RED} />
            <Box k="Coins up today" v={stats ? `${stats.breadth.toFixed(0)}% of yours` : "--"} c={stats && stats.breadth >= 50 ? GREEN : RED} />
            <Box k="Portfolio 24h" v={pf ? `${pf.delta >= 0 ? "+" : "-"}${usd(Math.abs(pf.delta))} (${pct(pf.pct, 1)})` : "--"} c={tone(pf?.delta)} />
            <Box k="Sentiment" v={sentiment ? `${sentiment.value} · ${sentiment.label}` : "--"} c={YELLOW} />
            <Box k="Largest position" v={pf?.top ? `${pf.top.label} ${((pf.top.value / (portfolio?.total_value || 1)) * 100).toFixed(0)}%` : "--"} c="#37d6ff" />
          </div>
        </div>
      </Panel>

      {/* wave band */}
      <Panel title="Market wave · 7 days" sub="Average hourly move across the coins you hold · green up, red down, yellow = strong up">
        <div className="h-[100px]">{wave.length ? <WaveBand wave={wave} /> : <Loading h={100} />}</div>
      </Panel>

      {/* news on the coins you hold */}
      <Panel title="My coins · news" sub="Click a headline to open it · Google News · refreshes every 10 min"
        right={<span className="text-[9px] text-white/40">{myNews?.length ?? 0} STORIES</span>}>
        {myNews ? (
          <>
            <div className="mb-2 flex flex-wrap gap-1">
              {["ALL", ...Array.from(new Set(myNews.map((n) => n.symbol)))].map((sym) => (
                <button key={sym} onClick={() => setNewsFilter(sym)} aria-pressed={newsFilter === sym}
                  className={`rounded border px-2 py-0.5 text-[9px] font-bold tracking-wider ${newsFilter === sym ? "border-[var(--cyan)] bg-[var(--cyan)] text-black" : "border-[var(--line)] text-white/60 hover:text-white"}`}>
                  {sym}
                </button>
              ))}
            </div>
            <ul className="grid gap-x-4 gap-y-1.5 md:grid-cols-2">
              {myNews.filter((n) => newsFilter === "ALL" || n.symbol === newsFilter).map((n) => {
                const id = n.link;
                const open = openStory === id;
                return (
                  <li key={id} className={`rounded border ${open ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-[var(--line)] hover:border-white/25"}`}>
                    <button
                      type="button"
                      onClick={() => setOpenStory(open ? null : id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-2 p-2 text-left text-[11px] leading-snug"
                    >
                      <span className="mt-px h-fit shrink-0 rounded bg-[var(--yellow)] px-1 text-[8px] font-bold text-black">{n.symbol}</span>
                      <span className="min-w-0 flex-1 text-white/90">{n.title}</span>
                      <span className="shrink-0 text-[9px] text-white/40" aria-hidden>{open ? "▲" : "▼"}</span>
                    </button>
                    {open && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-2 py-2 text-[10px]">
                        <span className="text-white/60">
                          {n.source}
                          {n.published ? ` · ${timeAgo(n.published)}` : ""}
                        </span>
                        <a href={n.link} target="_blank" rel="noopener noreferrer"
                          className="rounded bg-[var(--cyan)] px-2.5 py-1 font-bold text-black hover:brightness-110">
                          Read full story ↗
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <Loading h={120} />
        )}
      </Panel>

      {/* bottom row */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="Sentiment chain" sub="Fear & greed (whole market) · correlation of your coins" className="lg:col-span-6">
          {sentiment && market ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Gauge value={sentiment.value} label={sentiment.label} />
                <SentimentBars history={sentiment.history_7d} />
              </div>
              <Correlation coins={market} />
            </div>
          ) : (
            <Loading h={220} />
          )}
        </Panel>

        <Panel title="Return distribution" sub="Your coins, every hour, pooled" className="lg:col-span-6">
          {market ? (
            <>
              <Distribution coins={market} />
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                {(() => {
                  const all = market.flatMap((c) => returns(c.sparkline_7d));
                  const upShare = all.length ? (all.filter((r) => r >= 0).length / all.length) * 100 : 0;
                  return (
                    <>
                      <Box k="Up hours" v={`${upShare.toFixed(0)}%`} c={GREEN} />
                      <Box k="Down hours" v={`${(100 - upShare).toFixed(0)}%`} c={RED} />
                      <Box k="Samples" v={String(all.length)} c="#fff" />
                    </>
                  );
                })()}
              </div>
            </>
          ) : (
            <Loading h={220} />
          )}
        </Panel>

      </div>

      <footer className="pb-2 text-center text-[9px] uppercase tracking-widest text-white/35">
        Prices USD via CoinGecko and your exchanges · News via Google News · refresh 30s{s.updated ? ` · last ${s.updated.toISOString().slice(11, 19)} UTC` : ""}
      </footer>
    </div>
  );
}

function aggregate(p: Portfolio) {
  const m = new Map<string, number>();
  for (const h of p.holdings) m.set(h.symbol, (m.get(h.symbol) ?? 0) + h.value);
  return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function Stat({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div>
      <dt className="panel-sub !mt-0">{k}</dt>
      <dd className="text-[13px] font-bold tabular-nums" style={{ color: c }}>{v}</dd>
    </div>
  );
}

function Box({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="rounded border border-[var(--line)] bg-black/30 px-2 py-1.5">
      <div className="panel-sub !mt-0">{k}</div>
      <div className="text-[12px] font-bold tabular-nums" style={{ color: c }}>{v}</div>
    </div>
  );
}
