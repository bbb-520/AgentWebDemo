import { useEffect, useMemo, useRef, useState } from 'react';
import './ScrambledText.css';

interface Props {
  radius?: number;
  duration?: number;
  speed?: number;
  scrambleChars?: string;
  className?: string;
  style?: React.CSSProperties;
  children: string;
}

/**
 * React Bits 风格的局部字符扰动：指针靠近文字时，字符短暂显示为随机符号，
 * 随后平滑还原。用原生 RAF 实现，保证首页无需额外加载动画插件。
 */
export default function ScrambledText({
  radius = 100,
  duration = 1.2,
  speed = 0.5,
  scrambleChars = '.:',
  className = '',
  style,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrambled, setScrambled] = useState<Record<number, string>>({});
  const timers = useRef<Record<number, number>>({});
  const chars = useMemo(() => Array.from(children), [children]);

  useEffect(() => () => Object.values(timers.current).forEach((id) => window.clearTimeout(id)), []);

  const scrambleAt = (index: number, distance: number) => {
    const char = chars[index];
    if (!char || char === ' ') return;
    const durationMs = Math.max(120, duration * 1000 * (1 - distance / radius));
    const intervalMs = Math.max(28, 90 * (1 - speed * 0.55));
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      if (elapsed >= durationMs) {
        setScrambled((current) => {
          const next = { ...current };
          delete next[index];
          return next;
        });
        return;
      }
      const symbol = scrambleChars[Math.floor(Math.random() * scrambleChars.length)] || ':';
      setScrambled((current) => ({ ...current, [index]: symbol }));
      timers.current[index] = window.setTimeout(tick, intervalMs);
    };
    window.clearTimeout(timers.current[index]);
    tick();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-char-index]').forEach((node) => {
      const rect = node.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2),
      );
      if (distance < radius) scrambleAt(Number(node.dataset.charIndex), distance);
    });
  };

  return (
    <div ref={rootRef} className={`scrambled-text ${className}`} style={style} onPointerMove={onPointerMove}>
      <p>
        {chars.map((char, index) => (
          <span className="scrambled-char" data-char-index={index} key={`${char}-${index}`}>
            {scrambled[index] ?? char}
          </span>
        ))}
      </p>
    </div>
  );
}
