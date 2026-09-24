"use client";

import { useEffect, useState } from "react";
import type { Position } from "@/lib/api";
import { GREEN, RED, YELLOW, pct, price, tone, usd } from "@/lib/stats";

const STORE_KEY = "cih-alerted";

function readAlerted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeAlerted(list: string[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable, alerts just repeat on reload */
  }
}

/** Banner + desktop notification when a coin's gain crosses the target. */
export function useGainAlerts(positions: Position[] | undefined, target: number) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (!positions) return;
    const hit = positions.filter((p) => p.alert).map((p) => p.symbol);
    const already = readAlerted();
    // forget coins that fell back under the target so a re-cross alerts again
    const still = already.filter((s) => hit.includes(s));
    const fresh = hit.filter((s) => !already.includes(s));
    if (perm === "granted") {
      for (const sym of fresh) {
        const p = positions.find((x) => x.symbol === sym)!;
        try {
          new Notification(`${sym} is up ${p.gain_pct.toFixed(0)}%`, {
            body: `Over your ${target}% target. Avg buy ${price(p.avg_buy_price)}, now ${price(p.price)}.`,
          });
        } catch {
          /* some browsers block constructing notifications */
        }
      }
      writeAlerted([...still, ...fresh]);
    } else {
      writeAlerted(still);
    }
  }, [positions, perm, target]);

  return {
    perm,
    enable: async () => {
      if (typeof Notification === "undefined") return;
      setPerm(await Notification.requestPermission());
    },
  };
}

export function AlertBanner({ positions, target, perm, enable }: { positions: Position[]; target: number; perm: string; enable: () => void }) {
  const hits = positions.filter((p) => p.alert);
  if (!hits.length) return null;
  return (
    <div role="alert" className="panel flex flex-wrap items-center justify-between gap-2 border-[var(--yellow)] px-3 py-2 text-[11px]" style={{ borderColor: YELLOW, background: "rgba(245,197,24,0.08)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="rounded bg-[var(--yellow)] px-1.5 py-0.5 text-[9px] font-bold text-black">TARGET HIT</span>
        {hits.map((p) => (
          <span key={p.symbol} className="font-bold">
            {p.symbol} <span style={{ color: GREEN }}>{pct(p.gain_pct, 0)}</span>
            <span className="ml-1 font-normal text-white/60">over your {target}% target, {usd(p.profit)} profit</span>
          </span>
        ))}
      </div>
      {perm === "default" && (
        <button onClick={enable} className="rounded border border-[var(--yellow)] px-2 py-0.5 text-[10px] font-bold text-[var(--yellow)] hover:bg-[var(--yellow)] hover:text-black">
          Enable desktop alerts
        </button>
      )}
    </div>
  );
}

export function PositionsTable({ positions, target }: { positions: Position[]; target: number }) {
  // bar runs from 0% to the target; anything past it is full and gold
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[11px] tabular-nums">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-widest text-white/40">
            <th className="pb-1 font-normal">Coin</th>
            <th className="pb-1 text-right font-normal">Avg buy</th>
            <th className="pb-1 text-right font-normal">Price</th>
            <th className="pb-1 text-right font-normal">Gain</th>
            <th className="pb-1 text-right font-normal">Profit</th>
            <th className="w-[32%] pb-1 pl-4 font-normal">Progress to {target}%</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const frac = Math.max(0, Math.min(1, p.gain_pct / target));
            const color = p.alert ? YELLOW : p.gain_pct < 0 ? RED : GREEN;
            return (
              <tr key={p.symbol} className="border-t border-[var(--line)]">
                <td className="py-1.5 font-bold">
                  {p.symbol}
                  {p.alert && <span className="ml-2 rounded bg-[var(--yellow)] px-1 text-[8px] text-black">ALERT</span>}
                </td>
                <td className="py-1.5 text-right text-white/60">{price(p.avg_buy_price)}</td>
                <td className="py-1.5 text-right">{price(p.price)}</td>
                <td className="py-1.5 text-right font-bold" style={{ color: tone(p.gain_pct) }}>{pct(p.gain_pct, 1)}</td>
                <td className="py-1.5 text-right" style={{ color: tone(p.profit) }}>{p.profit >= 0 ? "+" : "-"}{usd(Math.abs(p.profit))}</td>
                <td className="py-1.5 pl-4">
                  <div className="h-2 rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(p.gain_pct)} aria-valuemin={0} aria-valuemax={target} aria-label={`${p.symbol} progress to ${target}% gain`}>
                    <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: color, boxShadow: p.alert ? `0 0 8px ${YELLOW}` : undefined }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
