"use client";

import { useEffect, useRef } from "react";

export type FieldCoin = { coin: string; green: number; held: boolean };

/**
 * The market field: thousands of particles swirling round a tilted ring, one sector per coin.
 * A coin's sector is brighter, thicker and faster the more dots it has; the coin the bot holds glows gold.
 */
export function Field({ coins, total, height = 560 }: { coins: FieldCoin[]; total: number; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const key = coins.map((c) => `${c.coin}${c.green}${c.held ? 1 : 0}`).join();

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, frame = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);

    const n = coins.length || 1;
    const sector = (Math.PI * 2) / n;
    const color = (c: FieldCoin) => (c.held ? [255, 180, 84] : c.green >= total - 1 ? [92, 225, 255] : c.green >= total - 2 ? [150, 200, 235] : [90, 115, 145]);
    // particles: [coin index, place along its sector, radius offset, height, flow speed, previous x, previous y].
    // Sectors stay evenly spaced; a coin's energy shows as faster flow and a thicker, brighter band.
    const span = sector * 0.92;
    const parts: number[][] = [];
    coins.forEach((c, i) => {
      const count = 260 + c.green * 110 + (c.held ? 150 : 0);
      for (let k = 0; k < count; k++) {
        const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // roughly bell-shaped
        parts.push([i, Math.random() * span, g * (0.12 + c.green * 0.04),
          (Math.random() - 0.5) * (0.3 + c.green * 0.08), 0.03 + c.green * 0.035 + Math.random() * 0.03, NaN, NaN]);
      }
    });

    const t0 = performance.now();
    let last = t0;
    const labelEls = tags.current ? (Array.from(tags.current.children) as HTMLElement[]) : [];
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const cx = w / 2, cy = h / 2, R = Math.min(w * 0.42, h * 0.6);
      const tilt = 0.42 + Math.sin(t * 0.07) * 0.06, spin = t * 0.05;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(5,7,13,0.13)"; // fade old trails
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const project = (a: number, r: number, y: number) => {
        const x3 = Math.cos(a + spin) * r, z3 = Math.sin(a + spin) * r;
        return [cx + x3 * R, cy + z3 * R * Math.cos(tilt) * 0.62 + y * R * 0.55, z3];
      };
      for (const p of parts) {
        const c = coins[p[0]];
        if (!still) p[1] = (p[1] + p[4] * dt * (1 + Math.sin(t * 0.6 + p[0]) * 0.3)) % span;
        const a = p[0] * sector - span / 2 + p[1];
        const wobble = Math.sin(a * 3 + t * 0.8 + p[0]) * 0.05;
        const [x, y, z] = project(a, 1 + p[2] + wobble, p[3] + Math.sin(a * 2 + t) * 0.05);
        const [r, g, b] = color(c);
        const alpha = (0.22 + (c.green / total) * 0.55 + (c.held ? 0.2 : 0)) * (0.55 + (z + 1) * 0.3);
        if (!Number.isNaN(p[5]) && Math.abs(x - p[5]) < 40) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.lineWidth = 0.7 + (c.green / total) * 1.1;
          ctx.beginPath();
          ctx.moveTo(p[5], p[6]);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        p[5] = x;
        p[6] = y;
      }
      // labels sit just outside the middle of each sector
      coins.forEach((c, i) => {
        const el = labelEls[i];
        if (!el) return;
        const [x, y] = project(i * sector, 1.38, 0);
        el.style.transform = `translate(${x - 20}px, ${y - 8}px)`;
      });
      if (!still) frame = requestAnimationFrame(draw);
    };
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, cv.clientWidth, cv.clientHeight);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the coins' dots change
  }, [key, total]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }} aria-hidden="true">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div ref={tags} className="pointer-events-none absolute inset-0">
        {coins.map((c) => (
          <span key={c.coin} className="absolute left-0 top-0 whitespace-nowrap text-[11px] font-bold tracking-wider"
            style={{ color: c.held ? "var(--yellow)" : c.green >= total - 1 ? "var(--cyan)" : "#7d90a8" }}>
            {c.coin} {c.green}/{total}
          </span>
        ))}
      </div>
    </div>
  );
}
