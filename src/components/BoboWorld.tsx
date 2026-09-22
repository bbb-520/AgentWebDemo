import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import BoboFlipbook from './BoboFlipbook';
import { photoArchivePhotos } from './photo-archive';
import './bobo-world.css';

type View = 'book' | 'ring' | 'cards' | 'atlas';
type Photo = { src: string; alt: string };
type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

const photos: Photo[] = photoArchivePhotos.map(({ src, alt }) => ({ src, alt }));

function useSurfaceMotion(initial = 0) {
  const [rotation, setRotation] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef(0);
  const flush = () => { frame.current = null; setRotation((value) => value + pending.current); pending.current = 0; };
  const onDown = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, moved: false }; };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    pending.current += dx * 0.24; drag.current.x = event.clientX;
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); setZoom((value) => Math.max(0.72, Math.min(1.42, value - event.deltaY * 0.00075))); };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return { rotation, zoom, drag, onDown, onMove, onUp, onWheel };
}

function PhotoRing() {
  const surface = useSurfaceMotion(0); const [active, setActive] = useState(0);
  return <div className="gallery-surface photo-ring" onPointerDown={surface.onDown} onPointerMove={surface.onMove} onPointerUp={surface.onUp} onPointerCancel={surface.onUp} onWheel={surface.onWheel}>
    <div className="ring-halo" aria-hidden="true" />
    <div className="ring-items" style={{ '--rotation': `${surface.rotation}deg`, '--zoom': surface.zoom } as CSSVars}>
      {photos.map((photo, index) => { const angle = index * (360 / photos.length); return <button type="button" aria-label={photo.alt} className={`ring-photo${index === active ? ' is-active' : ''}`} style={{ '--angle': `${angle}deg` } as CSSVars} key={photo.src} onClick={() => { if (!surface.drag.current?.moved) setActive(index); }}><img src={photo.src} alt={photo.alt} draggable={false} /></button>; })}
    </div><span className="gallery-index" aria-live="polite">{String(active + 1).padStart(2, '0')}</span>
  </div>;
}

function CardCorridor() {
  const surface = useSurfaceMotion(0); const [progress, setProgress] = useState(0.5);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const progressFrame = useRef<number | null>(null); const progressDelta = useRef(0);
  const updateProgress = (delta: number) => { progressDelta.current += delta; if (progressFrame.current !== null) return; progressFrame.current = requestAnimationFrame(() => { progressFrame.current = null; const deltaNow = progressDelta.current; progressDelta.current = 0; setProgress((value) => Math.max(0, Math.min(1, value + deltaNow))); }); };
  useEffect(() => () => { if (progressFrame.current !== null) cancelAnimationFrame(progressFrame.current); }, []);
  const onDown = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, moved: false }; };
  const onMove = (event: PointerEvent<HTMLDivElement>) => { if (!drag.current) return; const dx = event.clientX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; updateProgress(dx * 0.0018); drag.current.x = event.clientX; };
  const onUp = () => { drag.current = null; };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); updateProgress(event.deltaY * 0.00065); };
  return <div className="gallery-surface card-corridor" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
    <div className="corridor-floor" aria-hidden="true" /><div className="corridor-items" style={{ '--zoom': surface.zoom } as CSSVars}>
      {photos.map((photo, index) => { const center = (photos.length - 1) / 2; const offset = index - center; const spread = 230 * progress; const depth = (1 - progress) * (Math.abs(offset) * 78 + 80); const arc = Math.sin((index / (photos.length - 1)) * Math.PI) * (1 - progress) * -115; const tilt = offset * (1 - progress) * -13; return <button type="button" aria-label={photo.alt} className="corridor-card" key={photo.src} style={{ '--x': `${offset * spread}px`, '--y': `${arc}px`, '--z': `${-depth}px`, '--tilt': `${tilt}deg`, '--order': index } as CSSVars} onClick={() => !drag.current?.moved && setProgress(index / Math.max(1, photos.length - 1))}><img src={photo.src} alt={photo.alt} draggable={false} /></button>; })}
    </div><span className="gallery-index" aria-hidden="true">{String(Math.round(progress * 99)).padStart(2, '0')}</span>
  </div>;
}

function ImageAtlas() {
  const surface = useSurfaceMotion(0); const [active, setActive] = useState(0);
  return <div className="gallery-surface image-atlas" onPointerDown={surface.onDown} onPointerMove={surface.onMove} onPointerUp={surface.onUp} onPointerCancel={surface.onUp} onWheel={surface.onWheel}>
    <div className="atlas-orbit atlas-orbit-one" aria-hidden="true" /><div className="atlas-orbit atlas-orbit-two" aria-hidden="true" /><div className="atlas-orbit atlas-orbit-three" aria-hidden="true" />
    <div className="atlas-items" style={{ '--rotation': `${surface.rotation}deg`, '--zoom': surface.zoom } as CSSVars}>{photos.map((photo, index) => { const angle = index * (360 / photos.length); const radius = 120 + (index % 3) * 82; return <button type="button" aria-label={photo.alt} className={`atlas-photo${index === active ? ' is-active' : ''}`} style={{ '--angle': `${angle}deg`, '--radius': `${radius}px` } as CSSVars} key={photo.src} onClick={() => { if (!surface.drag.current?.moved) setActive(index); }}><img src={photo.src} alt={photo.alt} draggable={false} /></button>; })}</div>
    <span className="gallery-index" aria-live="polite">{String(active + 1).padStart(2, '0')}</span>
  </div>;
}

function ModeIcon({ view }: { view: View }) {
  if (view === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3.4-.9 5.7-.3 8 1.4v12c-2.3-1.7-4.6-2.3-8-1.4zM20 5.5c-3.4-.9-5.7-.3-8 1.4v12c2.3-1.7 4.6-2.3 8-1.4z" /></svg>;
  if (view === 'ring') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /></svg>;
  if (view === 'cards') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="12" height="15" rx="1" /><rect x="8" y="3" width="11" height="14" rx="1" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M20 12h-5M12 20v-5M4 12h5" /></svg>;
}

export default function BoboWorld({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const [view, setView] = useState<View>('book');
  return <div className="bobo-world">
    <header className="world-header"><button type="button" onClick={onBack} className="world-icon-button" aria-label="返回开始页"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button><div className="world-mark" aria-hidden="true"><span /><span /><span /></div><button type="button" onClick={onStart} className="world-icon-button" aria-label="打开聊天"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg></button></header>
    <nav className="world-dock" aria-label="相册视图">{(['book', 'ring', 'cards', 'atlas'] as View[]).map((item) => <button type="button" key={item} className={view === item ? 'is-active' : ''} onClick={() => setView(item)} aria-label={item}><ModeIcon view={item} /></button>)}</nav>
    <main className="world-main">{view === 'book' ? <div className="world-book"><BoboFlipbook /></div> : view === 'ring' ? <PhotoRing /> : view === 'cards' ? <CardCorridor /> : <ImageAtlas />}</main>
    <span className="world-live" aria-live="polite">{view}</span>
  </div>;
}
