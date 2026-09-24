"use client";

import { useEffect, useRef } from "react";
import type { MarketCoin } from "@/lib/api";
import { GREEN, RED, YELLOW } from "@/lib/stats";

type Node = { x: number; y: number; z: number; r: number; color: string; label?: string; big: boolean };

function buildNodes(coins: MarketCoin[]): Node[] {
  const N = 96;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const maxCap = Math.max(...coins.map((c) => c.market_cap), 1);
  const nodes: Node[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    const coin = i < coins.length * 3 && i % 3 === 0 ? coins[i / 3] : undefined;
    const big = !!coin;
    nodes.push({
      x: Math.cos(th) * rad,
      y,
      z: Math.sin(th) * rad,
      r: coin ? 0.07 + 0.09 * Math.sqrt(coin.market_cap / maxCap) : 0.045,
      color: coin ? (coin.change_24h_pct == null ? YELLOW : coin.change_24h_pct >= 0 ? GREEN : RED) : "#5b6b86",
      label: coin?.symbol,
      big,
    });
  }
  return nodes;
}

export function NeuralShell({ coins }: { coins: MarketCoin[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const nodes = buildNodes(coins);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let angle = 0.6;
    let tilt = 0.35;
    const AUTO = still ? 0 : 0.0032;
    let vel = AUTO; // yaw speed, decays back to the slow auto-spin after a flick
    let dragging = false;
    let lastX = 0, lastY = 0;
    let raf = 0;
    let w = 0, h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.34;
      const cx = w / 2, cy = h / 2;

      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
      glow.addColorStop(0, "rgba(55,214,255,0.10)");
      glow.addColorStop(1, "rgba(55,214,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const ca = Math.cos(angle), sa = Math.sin(angle);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const pts = nodes.map((n) => {
        const x1 = n.x * ca + n.z * sa;
        const z1 = -n.x * sa + n.z * ca;
        const y2 = n.y * ct - z1 * st;
        const z2 = n.y * st + z1 * ct;
        const persp = 1 / (1.9 - z2 * 0.5);
        return { n, sx: cx + x1 * R * persp * 1.9, sy: cy + y2 * R * persp * 1.9, z: z2, s: persp * 1.9 };
      });
      pts.sort((a, b) => a.z - b.z);

      // links between neighbouring front-facing cells
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          if (a.z < 0 || b.z < 0) continue;
          const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          if (d < R * 0.32) {
            ctx.strokeStyle = `rgba(150,170,200,${0.12 * (1 - d / (R * 0.32))})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      for (const p of pts) {
        const depth = (p.z + 1) / 2; // 0 back .. 1 front
        const alpha = 0.18 + depth * 0.82;
        const rr = p.n.r * R * p.s * (p.n.big ? 1.25 : 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(190,200,215,0.32)";
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rr * 1.7, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = "rgba(220,230,245,0.35)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = p.n.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rr, 0, 6.2832);
        ctx.fill();
        if (p.n.label && depth > 0.55) {
          ctx.fillStyle = "#05070d";
          ctx.font = `700 ${Math.max(8, rr * 0.9)}px var(--font-geist-mono), monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.n.label, p.sx, p.sy);
        }
      }
      ctx.globalAlpha = 1;

      if (!dragging) {
        angle += vel;
        vel += (AUTO - vel) * 0.04;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const clampTilt = (t: number) => Math.max(-1.3, Math.min(1.3, t));
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      angle += dx * 0.009;
      tilt = clampTilt(tilt + dy * 0.009);
      vel = dx * 0.009; // remembered so releasing mid-swipe keeps spinning
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const key = (e: KeyboardEvent) => {
      const step = 0.15;
      if (e.key === "ArrowLeft") angle -= step;
      else if (e.key === "ArrowRight") angle += step;
      else if (e.key === "ArrowUp") tilt = clampTilt(tilt - step);
      else if (e.key === "ArrowDown") tilt = clampTilt(tilt + step);
      else return;
      e.preventDefault();
    };
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
    };
  }, [coins]);

  return <canvas
      ref={ref}
      tabIndex={0}
      style={{ touchAction: "pan-y" }}
      className="h-full w-full select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
      aria-label="Sphere of the coins you hold, coloured by 24 hour change. Drag or use arrow keys to rotate."
    />;
}
