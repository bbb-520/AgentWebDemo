import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './DodgeField.css';

type Axis = 'x' | 'y' | 'both';
type Wall = 'clamp' | 'bounce';
type DodgeState = { dodges: number; gave: boolean; caught: boolean; fleeing: boolean };

interface Props {
  children?: ReactNode | ((state: DodgeState) => ReactNode);
  taunts?: string[];
  notice?: string;
  inkColor?: string;
  contrastColor?: string;
  fieldHeight?: number;
  reach?: number;
  radius?: number;
  falloff?: number;
  fleeDuration?: number;
  returnDuration?: number;
  returnBounce?: number;
  axis?: Axis;
  wall?: Wall;
  patience?: number;
  disabled?: boolean;
  onDodge?: (count: number) => void;
  onRelent?: () => void;
  onCatch?: () => void;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_TAUNTS = ['Catch me', 'Nope', 'Almost', 'Too slow', 'Okay, okay'];
const INSET = 12;

function clamp(value: number, room: number) {
  return Math.min(room, Math.max(-room, value));
}

function bounce(value: number, room: number, wall: Wall) {
  if (wall === 'bounce') {
    if (value > room) return Math.max(-room, 2 * room - value);
    if (value < -room) return Math.min(room, -2 * room - value);
  }
  return clamp(value, room);
}

export default function DodgeField({
  children,
  taunts = DEFAULT_TAUNTS,
  notice = '',
  inkColor = '#f54e00',
  contrastColor = '#fff',
  fieldHeight = 174,
  reach = 92,
  radius = 174,
  falloff = 1.25,
  fleeDuration = 130,
  returnDuration = 620,
  returnBounce = 0.1,
  axis = 'both',
  wall = 'bounce',
  patience = 6,
  disabled = false,
  onDodge,
  onRelent,
  onCatch,
  className = '',
  style,
}: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const roomRef = useRef({ x: 0, y: 0 });
  const armedRef = useRef(true);
  const lastMoveRef = useRef(0);
  const holdRef = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [inside, setInside] = useState(false);
  const [dodges, setDodges] = useState(0);
  const [caught, setCaught] = useState(false);
  const [labelIndex, setLabelIndex] = useState(0);
  const reduced = useReducedMotion();
  const gave = dodges >= Math.max(1, patience);
  const still = gave || caught || disabled;

  useEffect(() => {
    const field = fieldRef.current;
    const mover = moverRef.current;
    if (!field || !mover) return undefined;
    const measure = () => {
      roomRef.current = {
        x: Math.max(0, (field.clientWidth - mover.offsetWidth) / 2 - INSET),
        y: Math.max(0, (field.clientHeight - mover.offsetHeight) / 2 - INSET),
      };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field); observer.observe(mover);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (dodges) onDodge?.(dodges);
  }, [dodges, onDodge]);

  useEffect(() => {
    if (gave) onRelent?.();
  }, [gave, onRelent]);

  useEffect(() => () => {
    if (holdRef.current) window.clearTimeout(holdRef.current);
  }, []);

  const resetPosition = () => {
    pointerRef.current = null;
    armedRef.current = true;
    setInside(false);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || disabled || still) return;
    const field = fieldRef.current;
    if (!field) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    const rect = field.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const nextInside = distance <= radius;
    setInside(nextInside);
    if (!nextInside) {
      setOffset({ x: 0, y: 0 });
      armedRef.current = true;
      return;
    }
    const now = performance.now();
    if (now - lastMoveRef.current < 105) return;
    lastMoveRef.current = now;
    if (distance < radius * 0.55 && armedRef.current) {
      armedRef.current = false;
      setDodges((count) => count + 1);
      const choices = taunts.length > 2 ? taunts.slice(1, -1) : taunts;
      setLabelIndex(1 + Math.floor(Math.random() * Math.max(1, choices.length)));
    } else if (distance > radius) {
      armedRef.current = true;
    }

    const awayAngle = Math.atan2(-dy, -dx);
    const jitter = (Math.random() - 0.5) * 1.25;
    const angle = axis === 'x' ? 0 : axis === 'y' ? Math.PI / 2 : awayAngle + jitter;
    const strength = Math.max(0.38, 1 - distance / radius) ** falloff * reach * (0.8 + Math.random() * 0.35);
    const next = {
      x: axis === 'y' ? 0 : Math.cos(angle) * strength,
      y: axis === 'x' ? 0 : Math.sin(angle) * strength,
    };
    setOffset({ x: bounce(next.x, roomRef.current.x, wall), y: bounce(next.y, roomRef.current.y, wall) });
  };

  const handleClick = () => {
    setCaught(true);
    onCatch?.();
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => {
      setCaught(false);
      setDodges(0);
      setLabelIndex(0);
      armedRef.current = false;
    }, 760);
  };

  const state = { dodges, gave, caught, fleeing: inside && !still };
  const index = gave || caught ? taunts.length - 1 : Math.min(labelIndex, taunts.length - 2);
  const content = typeof children === 'function' ? children(state) : children ?? (
    <button type="button" className="dodge-field__pill" aria-label={taunts[0]}>
      <span className="dodge-field__labels">
        {taunts.map((taunt, i) => <span key={`${taunt}-${i}`} className="dodge-field__label" data-active={i === index ? 'true' : 'false'}>{taunt}</span>)}
      </span>
    </button>
  );

  return (
    <div
      ref={fieldRef}
      className={`dodge-field${className ? ` ${className}` : ''}`}
      data-fled={inside && !still ? 'true' : 'false'}
      data-flat={reduced ? '' : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPosition}
      style={{ '--df-ink': inkColor, '--df-contrast': contrastColor, '--df-height': `${fieldHeight}px`, ...style } as CSSProperties}
    >
      <motion.div
        ref={moverRef}
        className="dodge-field__mover"
        animate={{ x: offset.x, y: offset.y }}
        transition={{ duration: reduced ? 0.08 : (inside ? fleeDuration : returnDuration) / 1000, ease: 'easeOut', bounce: reduced ? 0 : returnBounce }}
        data-fled={inside && !still ? 'true' : 'false'}
        data-relented={gave ? 'true' : 'false'}
        data-caught={caught ? 'true' : 'false'}
        onClick={handleClick}
      >
        {content}
      </motion.div>
      {!inside && notice ? <p className="dodge-field__notice">{notice}</p> : null}
    </div>
  );
}
