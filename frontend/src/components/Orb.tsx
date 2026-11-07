"use client";

import { useEffect, useRef } from "react";

export type OrbCoin = { coin: string; green: number; held: boolean };

const CYAN = 0x5ce1ff, DIM = 0x4a6078, AMBER = 0xffb454;

/**
 * A 3D globe with the bot's coins in orbit: the more dots a coin has, the closer and brighter it
 * flies; a coin the bot holds pulses. Labels are HTML, projected from the 3D positions each frame.
 */
export function Orb({ coins, total, size, labels = true }: { coins: OrbCoin[]; total: number; size: number; labels?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const key = coins.map((c) => `${c.coin}${c.green}${c.held ? 1 : 0}`).join();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false, frame = 0;
    const cleanup: (() => void)[] = [];

    import("three").then((THREE) => {
      if (stop) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      el.appendChild(renderer.domElement);
      cleanup.push(() => { renderer.dispose(); renderer.domElement.remove(); });

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(0, 1.6, 9.2);
      camera.lookAt(0, 0, 0);
      const world = new THREE.Group();
      world.rotation.z = 0.28;
      scene.add(world);

      // the globe: a faint wire shell and a lattice of points
      const shell = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.35, 2)),
        new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.12 }),
      );
      world.add(shell);
      const pts: number[] = [];
      for (let i = 0, n = 900; i < n; i++) { // Fibonacci sphere
        const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        pts.push(Math.cos(a) * r * 1.35, y * 1.35, Math.sin(a) * r * 1.35);
      }
      const dotsGeo = new THREE.BufferGeometry();
      dotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const globe = new THREE.Points(dotsGeo, new THREE.PointsMaterial({ color: CYAN, size: 0.035, transparent: true, opacity: 0.75 }));
      world.add(globe);

      // a soft glow behind it, drawn once on a small canvas
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 128;
      const g = glowCanvas.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(92,225,255,0.22)");
      grad.addColorStop(1, "rgba(92,225,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(3.6, 3.6, 1);
      scene.add(glow);

      // each coin on its own tilted orbit
      const moons = coins.map((c, i) => {
        const radius = 1.9 + (total - c.green) * 0.42;
        const tilt = new THREE.Group();
        tilt.rotation.x = 0.35 + (i % 4) * 0.22;
        tilt.rotation.y = i * 0.7;
        world.add(tilt);
        const ringPts = Array.from({ length: 129 }, (_, k) => {
          const a = (k / 128) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        });
        const lit = c.held || c.green >= total;
        tilt.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(ringPts),
          new THREE.LineBasicMaterial({ color: lit ? CYAN : DIM, transparent: true, opacity: lit ? 0.45 : 0.18 }),
        ));
        const color = c.held ? AMBER : c.green >= total - 1 ? CYAN : DIM;
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + c.green * 0.025, 20, 20),
          new THREE.MeshBasicMaterial({ color }),
        );
        tilt.add(body);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          opacity: 0.25 + c.green / total * 0.6,
        }));
        halo.scale.set(0.9, 0.9, 1);
        body.add(halo);
        return { c, body, halo, radius, phase: i * 1.9, speed: 0.12 + c.green * 0.03 };
      });

      const labelEls = labels && tags.current ? Array.from(tags.current.children) as HTMLElement[] : [];
      const v = new THREE.Vector3();
      const t0 = performance.now();
      const draw = () => {
        const t = still ? 0 : (performance.now() - t0) / 1000;
        world.rotation.y = t * 0.08;
        globe.rotation.y = t * 0.15;
        shell.rotation.y = -t * 0.05;
        moons.forEach((m, i) => {
          const a = m.phase + t * m.speed;
          m.body.position.set(Math.cos(a) * m.radius, 0, Math.sin(a) * m.radius);
          if (m.c.held) m.halo.scale.setScalar(0.9 + Math.sin(t * 3) * 0.35);
          const label = labelEls[i];
          if (label) {
            m.body.getWorldPosition(v).project(camera);
            label.style.transform = `translate(${((v.x + 1) / 2) * size + 8}px, ${((1 - v.y) / 2) * size - 8}px)`;
            label.style.opacity = v.z < 1 ? "1" : "0";
          }
        });
        renderer.render(scene, camera);
        if (!still && !stop) frame = requestAnimationFrame(draw);
      };
      draw();
      cleanup.push(() => {
        cancelAnimationFrame(frame);
        scene.traverse((o) => {
          const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
          m.geometry?.dispose();
          m.material?.dispose();
        });
        glowTex.dispose();
      });
    });

    return () => {
      stop = true;
      cleanup.forEach((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the coins' dots change
  }, [key, size, total, labels]);

  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <div ref={host} className="absolute inset-0" />
      {labels && (
        <div ref={tags} className="pointer-events-none absolute inset-0 overflow-hidden">
          {coins.map((c) => (
            <span key={c.coin} className="absolute left-0 top-0 whitespace-nowrap text-[10px] font-bold tracking-wider"
              style={{ color: c.held ? "var(--yellow)" : c.green >= total - 1 ? "var(--cyan)" : "#7d90a8" }}>
              {c.coin} {c.green}/{total}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
