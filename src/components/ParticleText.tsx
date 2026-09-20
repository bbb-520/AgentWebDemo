import { useEffect, useRef } from 'react';
import './ParticleText.css';

interface ParticleTextProps {
  text: string;
  particleSize?: number;
  density?: number;
  color?: string;
  highlightColor?: string;
  scatter?: number;
  gatherDuration?: number;
  pointerRepel?: number;
  repelRadius?: number;
  idleDrift?: number;
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
}

type Particle = {
  x: number; y: number; tx: number; ty: number; sx: number; sy: number;
  seed: number; depth: number; size: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);

export default function ParticleText({
  text,
  particleSize = 1.7,
  density = 4,
  color = '#24231f',
  highlightColor = '#d86b3f',
  scatter = 130,
  gatherDuration = 1500,
  pointerRepel = 34,
  repelRadius = 110,
  idleDrift = 0.24,
  fontSize = 'clamp(5rem, 13vw, 11rem)',
  fontWeight = 500,
  fontFamily = 'inherit',
}: ParticleTextProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!host || !canvas || !ctx) return undefined;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let resizeFrame = 0;
    let startedAt = performance.now();
    let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const pointer = { active: false, x: 0, y: 0 };

    const sample = async () => {
      const rect = host.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      await document.fonts?.ready;
      const probe = document.createElement('canvas');
      const probeCtx = probe.getContext('2d', { willReadFrequently: true });
      if (!probeCtx) return;
      const computed = getComputedStyle(host);
      const family = fontFamily === 'inherit' ? computed.fontFamily : fontFamily;
      const probeSize = Math.min(width * 0.8, parseFloat(getComputedStyle(host).fontSize) || 180);
      probeCtx.font = `${fontWeight} ${probeSize}px ${family}`;
      const measured = probeCtx.measureText(text);
      const scale = Math.min(1, (width * 0.84) / Math.max(1, measured.width));
      const size = probeSize * scale;
      probeCtx.font = `${fontWeight} ${size}px ${family}`;
      const metrics = probeCtx.measureText(text);
      const pad = 18;
      probe.width = Math.ceil(metrics.width + pad * 2);
      probe.height = Math.ceil(size * 1.2 + pad * 2);
      probeCtx.font = `${fontWeight} ${size}px ${family}`;
      probeCtx.textBaseline = 'middle';
      probeCtx.fillStyle = '#fff';
      probeCtx.fillText(text, pad, probe.height / 2);
      const data = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
      const next: Particle[] = [];
      for (let y = 0; y < probe.height; y += density) {
        for (let x = 0; x < probe.width; x += density) {
          if (data[(y * probe.width + x) * 4 + 3] > 80) {
            const seed = ((next.length * 9301 + 49297) % 233280) / 233280;
            const depth = 0.45 + seed * 0.7;
            const tx = width / 2 - probe.width / 2 + x;
            const ty = height / 2 - probe.height / 2 + y;
            const distance = reducedMotion ? 0 : scatter * (0.4 + depth);
            const angle = seed * Math.PI * 2;
            next.push({ tx, ty, seed, depth, size: particleSize * (0.75 + seed * 0.4), x: tx + Math.cos(angle) * distance, y: ty + Math.sin(angle) * distance, sx: tx + Math.cos(angle) * distance, sy: ty + Math.sin(angle) * distance });
          }
        }
      }
      particles = next;
      startedAt = performance.now();
    };

    const render = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const progress = reducedMotion ? 1 : clamp((now - startedAt) / gatherDuration, 0, 1);
      const eased = easeOut(progress);
      particles.forEach((particle) => {
        let x = particle.sx + (particle.tx - particle.sx) * eased;
        let y = particle.sy + (particle.ty - particle.sy) * eased;
        if (progress >= 1 && !reducedMotion) {
          x += Math.sin(now * 0.001 + particle.seed * 9) * idleDrift * particle.depth;
          y += Math.cos(now * 0.0008 + particle.seed * 12) * idleDrift * particle.depth;
        }
        if (pointer.active && !reducedMotion) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < repelRadius) {
            const force = Math.pow(1 - distance / repelRadius, 2) * pointerRepel;
            x += (dx / distance) * force;
            y += (dy / distance) * force;
          }
        }
        particle.x += (x - particle.x) * 0.3;
        particle.y += (y - particle.y) * 0.3;
        const blend = clamp((particle.x / Math.max(1, width)) * 0.75 + particle.seed * 0.25, 0, 1);
        ctx.fillStyle = blend > 0.7 ? highlightColor : color;
        ctx.globalAlpha = 0.4 + eased * 0.6;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      });
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(render);
    };

    const queueSample = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => void sample());
    };
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotionChange = (event: MediaQueryListEvent) => { reducedMotion = event.matches; void sample(); };
    const observer = new ResizeObserver(queueSample);
    observer.observe(host);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    media?.addEventListener('change', onMotionChange);
    void sample();
    frame = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      media?.removeEventListener('change', onMotionChange);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
    };
  }, [color, density, fontFamily, fontWeight, gatherDuration, highlightColor, idleDrift, particleSize, pointerRepel, repelRadius, scatter, text]);

  return <div ref={hostRef} className="particle-text" style={{ fontSize }} aria-label={text}>
    <canvas ref={canvasRef} className="particle-text__canvas" aria-hidden="true" />
    <span className="particle-text__sr">{text}</span>
  </div>;
}
