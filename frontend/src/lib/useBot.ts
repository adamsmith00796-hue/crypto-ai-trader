"use client";

import { useEffect, useState } from "react";
import { api, type BotStatus } from "@/lib/api";

const REFRESH_MS = 60_000;
export type Ready = Extract<BotStatus, { ready: true }>;

/** The bot's state, refreshed every minute. */
export function useBot() {
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
  return { bot, err };
}

/** Coins held first, then closest to a buy. */
export function radarRows(b: Ready) {
  const held = new Set(Object.entries(b.live?.holdings ?? {}).filter(([, v]) => v >= 10).map(([c]) => c));
  return [...b.scanner]
    .map((r) => ({ ...r, held: held.has(r.coin) }))
    .sort((x, y) => Number(y.held) - Number(x.held) || y.green - x.green || y.strength - x.strength);
}
