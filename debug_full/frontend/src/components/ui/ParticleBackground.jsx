import { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';

// Adaptive count keeps GPU comfortable while filling screen
function targetCount() {
  const w = window.innerWidth;
  if (w > 1440) return 70;
  if (w > 1280) return 60;
  if (w > 1024) return 45;
  if (w > 768)  return 28;
  return 16;
}

// Three depth layers: 0 = foreground, 1 = mid, 2 = background
function createParticle(w, h) {
  const roll = Math.random();
  let r, layer;
  if (roll < 0.60) {
    r     = Math.random() * 1.4 + 0.7;   // 0.7 – 2.1 px  (small)
    layer = 0;
  } else if (roll < 0.90) {
    r     = Math.random() * 2.0 + 2.2;   // 2.2 – 4.2 px  (medium)
    layer = 1;
  } else {
    r     = Math.random() * 1.8 + 4.2;   // 4.2 – 6.0 px  (large accent)
    layer = 2;
  }

  // Deeper layers drift slower
  const speed = (layer === 0 ? 0.28 : layer === 1 ? 0.16 : 0.08) * (0.6 + Math.random() * 0.8);

  // Deeper layers are dimmer — foreground punches through
  const opacityBase = layer === 0
    ? Math.random() * 0.50 + 0.30
    : layer === 1
      ? Math.random() * 0.38 + 0.18
      : Math.random() * 0.22 + 0.08;

  return {
    x:          Math.random() * w,
    y:          Math.random() * h,
    r,
    layer,
    dx:         (Math.random() - 0.5) * speed * 2,
    dy:         (Math.random() - 0.5) * speed * 2,
    floatAmp:   Math.random() * 0.35 + 0.08,   // gentle vertical bob
    floatSpeed: 0.0025 + Math.random() * 0.004,
    floatPhase: Math.random() * Math.PI * 2,
    opacity:    opacityBase,
    pulse:      Math.random() * Math.PI * 2,
    pulseSpeed: 0.005 + Math.random() * 0.009,
    slot:       Math.floor(Math.random() * 12),
  };
}

// ─── Colour palettes (RGB strings, 12 slots each) ────────────────────────────
// Dark: vivid cyan → electric blue → violet — all bright against dark bg
const DARK = [
  '0,217,255',    // #00d9ff  cyan core
  '0,217,255',
  '0,205,245',    // cyan soft
  '20,210,255',   // cyan bright
  '59,130,246',   // #3b82f6  blue
  '59,130,246',
  '96,165,250',   // blue lighter
  '37,99,235',    // blue deep
  '99,102,241',   // #6366f1  violet
  '99,102,241',
  '129,140,248',  // violet lighter
  '139,92,246',   // purple accent
];

// Light: deep saturated blues & indigos — punch through the pale bg
const LIGHT = [
  '37,99,235',    // #2563eb   blue primary
  '37,99,235',
  '29,78,216',    // #1d4ed8   deep blue
  '29,78,216',
  '14,165,233',   // #0ea5e9   sky blue
  '14,165,233',
  '14,165,233',
  '79,70,229',    // #4f46e5   indigo
  '79,70,229',
  '99,102,241',   // indigo lighter
  '37,99,235',
  '29,78,216',
];

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const { isDark } = useTheme();
  const isDarkRef = useRef(isDark);

  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let rafId;
    let particles = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width  = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = targetCount();
      particles = Array.from({ length: n }, () => createParticle(canvas.width, canvas.height));
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    let mx = canvas.width  / 2;
    let my = canvas.height / 2;
    const onMouse = e => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', onMouse, { passive: true });

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const dark    = isDarkRef.current;
      const palette = dark ? DARK : LIGHT;
      // Light mode needs a push to stay visible on pale backgrounds
      const boost   = dark ? 1.0 : 1.8;

      const cx = canvas.width  / 2;
      const cy = canvas.height / 2;

      for (const p of particles) {
        p.x          += p.dx;
        p.y          += p.dy;
        p.pulse      += p.pulseSpeed;
        p.floatPhase += p.floatSpeed;

        // Wrap
        if (p.x < -8)                  p.x = canvas.width  + 8;
        if (p.x > canvas.width  + 8)   p.x = -8;
        if (p.y < -8)                  p.y = canvas.height + 8;
        if (p.y > canvas.height + 8)   p.y = -8;

        // Per-layer parallax — foreground tracks mouse more
        const pFactor = p.layer === 0 ? 0.026 : p.layer === 1 ? 0.011 : 0.004;
        const rx = p.x + (mx - cx) * pFactor;
        const ry = p.y + (my - cy) * pFactor + Math.sin(p.floatPhase) * p.floatAmp;

        const alpha = Math.min(1, p.opacity * boost * (0.68 + 0.32 * Math.sin(p.pulse)));
        const col   = palette[p.slot];

        // Core dot
        ctx.beginPath();
        ctx.arc(rx, ry, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col},${alpha})`;
        ctx.fill();

        // Soft inner glow halo — medium dots
        if (p.r > 2.0) {
          ctx.beginPath();
          ctx.arc(rx, ry, p.r * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col},${alpha * 0.13})`;
          ctx.fill();
        }

        // Wide outer bloom — large accent dots only
        if (p.r > 4.0) {
          ctx.beginPath();
          ctx.arc(rx, ry, p.r * 4.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col},${alpha * 0.055})`;
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        0,
        pointerEvents: 'none',
        opacity:       isDark ? 0.88 : 0.94,
        transition:    'opacity 0.4s ease',
      }}
      aria-hidden="true"
    />
  );
}
