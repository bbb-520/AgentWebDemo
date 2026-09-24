import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type TransitionEvent, type WheelEvent } from 'react';
import { fetchBoboWorld, type BoboWorldItem } from '../lib/api';
import { getPhotoFlightGeometry, type PhotoFlightGeometry } from './boboWorldMotion.mjs';
import TiltedCard from './TiltedCard';
import './bobo-world.css';

const PAGE_SIZE = 48;

type ViewState = { x: number; y: number; z: number; zoom: number; rx: number; ry: number };
type SelectedPhoto = { item: BoboWorldItem; geometry: PhotoFlightGeometry };
type FlightPhase = 'from' | 'open' | 'returning';
type PointerPoint = { x: number; y: number };
type Gesture = {
  kind: 'space' | 'photo';
  photoId?: string;
  moved: boolean;
  lastX: number;
  lastY: number;
  pinchStartDistance: number;
  pinchStartZoom: number;
};
type ViewerDrag = { x: number; y: number; moved: boolean; startX: number; startY: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: PointerPoint, b: PointerPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state + 0x6d2b79f5, 1 | state);
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function layoutFor(index: number, itemId: string, totalItems: number) {
  const isMobile = window.innerWidth <= 760;
  const viewportWidth = window.innerWidth;
  const viewportHeight = Math.max(320, window.innerHeight - (isMobile ? 104 : 111));
  const photoWidth = isMobile
    ? clamp(viewportWidth * 0.36, 118, 178)
    : clamp(viewportWidth * 0.16, 136, 230);
  const photoHeight = isMobile
    ? clamp(viewportWidth * 0.43, 148, 218)
    : clamp(viewportWidth * 0.23, 178, 302);
  const random = seededRandom(hashSeed(`${itemId}:${index}`));
  const compactWorld = totalItems <= 8;
  if (compactWorld) {
    // Keep small collections readable on narrow screens while still adding
    // enough deterministic jitter to make the arrangement feel organic.
    const columns = isMobile ? Math.min(2, totalItems) : Math.min(3, totalItems);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rows = Math.ceil(totalItems / columns);
    const gapX = photoWidth * (isMobile ? 0.34 : 0.42);
    const gapY = photoHeight * (isMobile ? 0.18 : 0.22);
    const groupWidth = columns * photoWidth + Math.max(0, columns - 1) * gapX;
    const groupHeight = rows * photoHeight + Math.max(0, rows - 1) * gapY;
    return {
      x: -groupWidth / 2 + column * (photoWidth + gapX) + (random() - 0.5) * photoWidth * 0.18,
      y: -groupHeight / 2 + row * (photoHeight + gapY) + (random() - 0.5) * photoHeight * 0.14,
      z: -160 + random() * 300,
      tilt: -12 + random() * 24,
      scale: 0.9 + random() * 0.22,
      width: photoWidth,
      height: photoHeight,
    };
  }
  const worldWidth = Math.max(viewportWidth * (isMobile ? 1.72 : 2.35), photoWidth * 2.2);
  const worldHeight = Math.max(viewportHeight * (isMobile ? 1.58 : 1.8), photoHeight * 1.45);
  return {
    x: (random() - 0.5) * worldWidth,
    y: (random() - 0.5) * worldHeight,
    z: -980 + random() * 1780,
    tilt: -12 + random() * 24,
    scale: isMobile ? 0.7 + random() * 0.52 : 0.62 + random() * 0.84,
    width: photoWidth,
    height: photoHeight,
  };
}

export default function BoboWorld({ onBack, onStart, baseUrl = '' }: {
  onBack: () => void;
  onStart: () => void;
  baseUrl?: string;
}) {
  const [items, setItems] = useState<BoboWorldItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SelectedPhoto | null>(null);
  const [flightPhase, setFlightPhase] = useState<FlightPhase>('from');
  const [captionVisible, setCaptionVisible] = useState(false);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  const [thumbnailFallbackIds, setThumbnailFallbackIds] = useState<Set<string>>(() => new Set());
  const [viewerFallbackIds, setViewerFallbackIds] = useState<Set<string>>(() => new Set());
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, z: 0, zoom: 1, rx: 0, ry: 0 });
  const [photoRotations, setPhotoRotations] = useState<Record<string, { x: number; y: number }>>({});
  const [viewerRotation, setViewerRotation] = useState({ x: 0, y: 0 });
  const requestRef = useRef<AbortController | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const photoElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const gestureRef = useRef<Gesture | null>(null);
  const viewerDragRef = useRef<ViewerDrag | null>(null);
  const suppressPhotoClickRef = useRef(false);

  const load = useCallback(async (nextCursor: string | null = null, replace = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const page = await fetchBoboWorld(baseUrl, PAGE_SIZE, nextCursor, controller.signal);
      if (controller.signal.aborted) return;
      setItems((previous) => {
        if (replace) return page.items;
        const known = new Set(previous.map((item) => item.itemId));
        return [...previous, ...page.items.filter((item) => !known.has(item.itemId))];
      });
      setCursor(page.nextCursor);
      if (replace) {
        setBrokenIds(new Set());
        setThumbnailFallbackIds(new Set());
        setViewerFallbackIds(new Set());
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error('[bobo-world] public world request failed', cause);
        setError(cause instanceof Error ? cause.message : '');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [baseUrl]);

  useEffect(() => {
    void load(null, true);
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeSelected = () => {
    if (!selected) return;
    setCaptionVisible(false);
    setViewerRotation({ x: 0, y: 0 });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSelected(null);
      return;
    }
    setFlightPhase('returning');
  };

  useEffect(() => {
    if (!selected) return;
    setViewerRotation({ x: 0, y: 0 });
    setCaptionVisible(false);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const openFrame = window.requestAnimationFrame(() => {
      setFlightPhase('open');
      if (reducedMotion) setCaptionVisible(true);
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(openFrame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  const selectPhoto = (item: BoboWorldItem, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    const hasCaption = Boolean(item.caption?.trim());
    const geometry = getPhotoFlightGeometry(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      hasCaption,
    );
    setCaptionVisible(false);
    setFlightPhase('from');
    setSelected({ item, geometry });
  };

  const handleFlightTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;
    if (flightPhase === 'open') setCaptionVisible(true);
    if (flightPhase === 'returning') setSelected(null);
  };

  const markBroken = (itemId: string) => setBrokenIds((previous) => new Set(previous).add(itemId));
  const handleMapImageError = (item: BoboWorldItem) => {
    if (item.thumbnailUrl && item.thumbnailUrl !== item.imageUrl && !thumbnailFallbackIds.has(item.itemId)) {
      setThumbnailFallbackIds((previous) => new Set(previous).add(item.itemId));
      return;
    }
    markBroken(item.itemId);
  };

  const handleViewerImageError = (item: BoboWorldItem) => {
    if (item.thumbnailUrl && item.thumbnailUrl !== item.imageUrl && !viewerFallbackIds.has(item.itemId)) {
      setViewerFallbackIds((previous) => new Set(previous).add(item.itemId));
      return;
    }
    markBroken(item.itemId);
  };

  const updateViewFromWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setView((current) => ({
      ...current,
      z: clamp(current.z - event.deltaY * 1.4, -1600, 1200),
      zoom: clamp(current.zoom - event.deltaY * 0.00035, 0.58, 1.65),
    }));
  };

  const onSpacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-photo-id]');
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const currentPoints = [...pointersRef.current.values()];
    if (currentPoints.length >= 2) {
      const startDistance = distance(currentPoints[0], currentPoints[1]);
      gestureRef.current = { kind: 'space', moved: true, lastX: event.clientX, lastY: event.clientY, pinchStartDistance: startDistance, pinchStartZoom: view.zoom };
    } else {
      gestureRef.current = { kind: target ? 'photo' : 'space', photoId: target?.dataset.photoId, moved: false, lastX: event.clientX, lastY: event.clientY, pinchStartDistance: 0, pinchStartZoom: view.zoom };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onSpacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const currentPoints = [...pointersRef.current.values()];
    if (currentPoints.length >= 2 && gesture.kind === 'space') {
      const nextDistance = distance(currentPoints[0], currentPoints[1]);
      if (gesture.pinchStartDistance > 0) {
        setView((current) => ({ ...current, zoom: clamp(gesture.pinchStartZoom * nextDistance / gesture.pinchStartDistance, 0.55, 1.8) }));
      }
      return;
    }
    const dx = event.clientX - gesture.lastX;
    const dy = event.clientY - gesture.lastY;
    if (Math.abs(event.clientX - gesture.lastX) + Math.abs(event.clientY - gesture.lastY) > 2) {
      gesture.moved = true;
      if (gesture.kind === 'photo') suppressPhotoClickRef.current = true;
    }
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    if (gesture.kind === 'photo' && gesture.photoId) {
      setPhotoRotations((current) => {
        const rotation = current[gesture.photoId!] ?? { x: 0, y: 0 };
        return { ...current, [gesture.photoId!]: { x: clamp(rotation.x - dy * 0.45, -42, 42), y: clamp(rotation.y + dx * 0.45, -42, 42) } };
      });
    } else {
      setView((current) => ({
        ...current,
        x: clamp(current.x + dx * 0.72, -180, 180),
        y: clamp(current.y + dy * 0.72, -130, 130),
        rx: clamp(current.rx - dy * 0.32, -84, 84),
        ry: current.ry + dx * 0.45,
      }));
    }
  };

  const onSpacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    pointersRef.current.delete(event.pointerId);
    if (gesture && gesture.kind === 'photo' && !gesture.moved && gesture.photoId) {
      const item = items.find((candidate) => candidate.itemId === gesture.photoId);
      const element = photoElementsRef.current.get(gesture.photoId);
      if (item && element) selectPhoto(item, element);
    }
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      window.setTimeout(() => { suppressPhotoClickRef.current = false; }, 0);
    }
  };

  const onViewerPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    viewerDragRef.current = { x: event.clientX, y: event.clientY, moved: false, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onViewerPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = viewerDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setViewerRotation((current) => ({ x: clamp(current.x - dy * 0.42, -28, 28), y: clamp(current.y + dx * 0.42, -28, 28) }));
  };
  const onViewerPointerUp = () => { viewerDragRef.current = null; };

  const worldTransform = `translate3d(${view.x}px, ${view.y}px, ${view.z}px) rotateX(${view.rx}deg) rotateY(${view.ry}deg) scale(${view.zoom})`;
  const photoItems = useMemo(() => items.map((item, index) => ({ item, layout: layoutFor(index, item.itemId, items.length) })), [items, viewportSize]);
  const selectedCaption = selected?.item.caption?.trim() ?? '';

  return (
    <div className="bobo-world">
      <header className="world-header">
        <button type="button" onClick={onBack} className="world-icon-button" aria-label="返回开始页" title="返回开始页">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <div className="world-brand"><div className="world-mark" aria-hidden="true"><span /><span /><span /></div></div>
        <button type="button" onClick={onStart} className="world-icon-button" aria-label="打开聊天" title="打开聊天">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg>
        </button>
      </header>

      <main className="world-main bobo-space-main">
        {loading ? <div className="world-view-loading" role="status" aria-label="照片加载中" /> : error ? (
          <div className="bobo-world-state" role="alert"><button type="button" onClick={() => void load(null, true)} aria-label="重新加载"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></svg></button></div>
        ) : items.length === 0 ? (
          <div className="bobo-world-state" aria-label="暂无照片" />
        ) : (
          <div className="bobo-space-viewport" onWheel={updateViewFromWheel} onPointerDown={onSpacePointerDown} onPointerMove={onSpacePointerMove} onPointerUp={onSpacePointerUp} onPointerCancel={onSpacePointerUp} aria-label="Bobo’s World 3D 照片空间">
            <div className="bobo-space-glow" aria-hidden="true" />
            <div className="bobo-space-world" style={{ transform: worldTransform }}>
              {photoItems.map(({ item, layout }, index) => {
                const rotation = photoRotations[item.itemId] ?? { x: 0, y: 0 };
                const cardStyle = { '--photo-x': `${layout.x}px`, '--photo-y': `${layout.y}px`, '--photo-z': `${layout.z}px`, '--photo-tilt': `${layout.tilt}deg`, width: `${layout.width}px`, height: `${layout.height}px`, transform: `translate3d(var(--photo-x), var(--photo-y), var(--photo-z)) rotateZ(var(--photo-tilt)) scale(${layout.scale}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` } as CSSProperties;
                return <button className={`bobo-space-photo${selected?.item.itemId === item.itemId ? ' is-selected' : ''}`} ref={(element) => { if (element) photoElementsRef.current.set(item.itemId, element); else photoElementsRef.current.delete(item.itemId); }} data-photo-id={item.itemId} key={item.itemId} type="button" style={cardStyle} onClick={(event) => { if (event.detail === 0 && !suppressPhotoClickRef.current) selectPhoto(item, event.currentTarget); }} aria-label={`打开第 ${index + 1} 张照片`}>
                  <span className="bobo-space-photo-film" aria-hidden="true" />
                  <span className="bobo-space-photo-frame">
                    {brokenIds.has(item.itemId) ? <span className="bobo-image-unavailable" role="img" aria-label="图片不可用" /> : <img src={thumbnailFallbackIds.has(item.itemId) ? item.imageUrl : item.thumbnailUrl || item.imageUrl} alt="Bobo’s World 公开照片" loading={index < 8 ? 'eager' : 'lazy'} onError={() => handleMapImageError(item)} />}
                  </span>
                </button>;
              })}
            </div>
          </div>
        )}
      </main>

      {cursor && !loading && <div className="bobo-world-more bobo-space-more"><button type="button" disabled={loadingMore} onClick={() => void load(cursor)} aria-label="加载更多照片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button></div>}

      {selected && <div className={`bobo-world-modal is-${flightPhase}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSelected(); }}>
        <section className="bobo-world-viewer" role="dialog" aria-modal="true" aria-label="作品预览">
          <div
            className="bobo-world-flight"
            onTransitionEnd={handleFlightTransitionEnd}
            style={{
              left: `${selected.geometry.left}px`,
              top: `${selected.geometry.top}px`,
              width: `${selected.geometry.width}px`,
              height: `${selected.geometry.height}px`,
              transform: flightPhase === 'open' ? 'translate3d(0, 0, 0) scale(1, 1)' : `translate3d(${selected.geometry.from.x}px, ${selected.geometry.from.y}px, 0) scale(${selected.geometry.from.scaleX}, ${selected.geometry.from.scaleY})`,
            }}
          >
            {brokenIds.has(selected.item.itemId) ? <div className="bobo-viewer-unavailable" role="img" aria-label="图片不可用" /> : (
              <div className="bobo-viewer-tilted" onPointerDown={onViewerPointerDown} onPointerMove={onViewerPointerMove} onPointerUp={onViewerPointerUp} onPointerCancel={onViewerPointerUp}>
                <TiltedCard
                  imageSrc={viewerFallbackIds.has(selected.item.itemId) ? selected.item.thumbnailUrl : selected.item.imageUrl}
                  altText="Bobo’s World 公开照片大图"
                  containerHeight="100%"
                  containerWidth="100%"
                  imageHeight="100%"
                  imageWidth="100%"
                  rotateAmplitude={10}
                  scaleOnHover={1.035}
                  showMobileWarning={false}
                  showTooltip={false}
                  displayOverlayContent={false}
                  onImageError={() => handleViewerImageError(selected.item)}
                />
              </div>
            )}
          </div>
          <button type="button" className="bobo-world-close" autoFocus onClick={closeSelected} aria-label="关闭预览" style={{ left: `${Math.min(window.innerWidth - 46, selected.geometry.left + selected.geometry.width - 16)}px`, top: `${Math.max(12, selected.geometry.top - 16)}px` }}>×</button>
          {selectedCaption && <div className={`bobo-world-details${captionVisible ? ' is-visible' : ''}`} style={{ left: '50%', top: `${Math.min(window.innerHeight - 72, selected.geometry.top + selected.geometry.height + 24)}px` }}>
            <div className="bobo-world-caption">{selected.item.senderName && <strong>{selected.item.senderName}：</strong>}{selectedCaption}</div>
          </div>}
        </section>
      </div>}
    </div>
  );
}
