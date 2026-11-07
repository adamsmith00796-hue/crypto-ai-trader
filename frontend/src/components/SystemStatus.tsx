"use client";

import { useEffect, useState } from "react";
import type { BotStatus } from "@/lib/api";
import { CYAN, RED, YELLOW } from "@/lib/stats";

const STALE_MS = 30 * 60_000; // backend refreshes every 5 min, so 30 min without news = stopped

export function SystemStatus({ bot, err }: { bot: BotStatus | null; err: string | null }) {
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
