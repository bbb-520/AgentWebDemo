import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import BoboFlipbook from './BoboFlipbook';
import CircularGallery from './CircularGallery.jsx';
import DomeGallery from './DomeGallery.jsx';
import { photoArchivePhotos } from './photo-archive';
import { fetchImageArchive, type ImageJobView } from '../lib/api';
import './bobo-world.css';

type View = 'book' | 'ring' | 'cards' | 'atlas' | 'works';
type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

const photos = photoArchivePhotos;
const circularGalleryItems = photos.map((photo, index) => ({
  image: photo.src,
  text: `PHOTO ${String(index + 1).padStart(2, '0')}`,
}));
const domeGalleryImages = photos.map((photo) => ({ src: photo.src, alt: photo.alt }));
const views: View[] = ['book', 'ring', 'cards', 'atlas', 'works'];
const viewMeta: Record<View, { label: string; title: string; description: string; hint: string }> = {
  book: { label: '书册', title: '翻开一段时间', description: '打开封面，让照片按自己的节奏出现。', hint: '点击书册打开 · 方向键翻页' },
  ring: { label: '环形', title: '围着记忆走一圈', description: '沿着弧线浏览私人相册，让每一张照片重新出现。', hint: '拖动浏览 · 滚轮切换 · 方向键移动' },
  cards: { label: '卡片', title: '把瞬间摊开', description: '拖动时间轴，看照片从一叠卡片变成一条路。', hint: '拖动展开 · 点击卡片定位' },
  atlas: { label: '星图', title: '寻找记忆的坐标', description: '把照片铺成一座穹顶，拖动视野慢慢探索。', hint: '拖动探索 · 点击放大 · Esc 关闭' },
  works: { label: '作品', title: '让照片继续生长', description: '后台生成的成品，会在这里成为一页私人档案。', hint: '点击成品打开高清图片' },
};

function useSurfaceMotion(initial = 0) {
  const [rotation, setRotation] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const clickBlocked = useRef(false);
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
  const onUp = () => { clickBlocked.current = Boolean(drag.current?.moved); drag.current = null; };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); setZoom((value) => Math.max(0.72, Math.min(1.42, value - event.deltaY * 0.00075))); };
  const canClick = () => { const allowed = !clickBlocked.current; clickBlocked.current = false; return allowed; };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return { rotation, zoom, drag, onDown, onMove, onUp, onWheel, canClick };
}

function CardCorridor() {
  const [progress, setProgress] = useState(0.5);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const clickBlocked = useRef(false);
  const progressFrame = useRef<number | null>(null); const progressDelta = useRef(0);
  const updateProgress = (delta: number) => { progressDelta.current += delta; if (progressFrame.current !== null) return; progressFrame.current = requestAnimationFrame(() => { progressFrame.current = null; const deltaNow = progressDelta.current; progressDelta.current = 0; setProgress((value) => Math.max(0, Math.min(1, value + deltaNow))); }); };
  useEffect(() => () => { if (progressFrame.current !== null) cancelAnimationFrame(progressFrame.current); }, []);
  const onDown = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, moved: false }; };
  const onMove = (event: PointerEvent<HTMLDivElement>) => { if (!drag.current) return; const dx = event.clientX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; updateProgress(dx * 0.0018); drag.current.x = event.clientX; };
  const onUp = () => { clickBlocked.current = Boolean(drag.current?.moved); drag.current = null; };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); updateProgress(event.deltaY * 0.00065); };
  return <div className="gallery-surface card-corridor" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
    <div className="corridor-floor" aria-hidden="true" /><div className="corridor-items">
      {photos.map((photo, index) => { const center = (photos.length - 1) / 2; const offset = index - center; const spread = 230 * progress; const depth = (1 - progress) * (Math.abs(offset) * 78 + 80); const arc = Math.sin((index / (photos.length - 1)) * Math.PI) * (1 - progress) * -115; const tilt = offset * (1 - progress) * -13; return <button type="button" aria-label={photo.alt} className="corridor-card" key={photo.src} style={{ '--x': `${offset * spread}px`, '--y': `${arc}px`, '--z': `${-depth}px`, '--tilt': `${tilt}deg`, '--order': index } as CSSVars} onClick={() => { if (!clickBlocked.current) setProgress(index / Math.max(1, photos.length - 1)); clickBlocked.current = false; }}><img src={photo.src} alt={photo.alt} draggable={false} /></button>; })}
    </div><span className="gallery-index" aria-hidden="true">{String(Math.round(progress * 99)).padStart(2, '0')}</span>
  </div>;
}

function DomeGallerySurface() {
  return <div className="gallery-surface dome-gallery-surface"><DomeGallery images={domeGalleryImages} grayscale={false} /></div>;
}

function WorksArchive({ jobs, loading, signedIn }: { jobs: ImageJobView[]; loading: boolean; signedIn: boolean }) {
  if (!signedIn) return <div className="generated-empty"><span>先登录 bobo</span><p>生成的图片会只属于你，并在这里形成私人作品档案。</p></div>;
  if (loading) return <div className="generated-empty"><span>正在翻找作品</span><p>把最近完成的成品放回书页。</p></div>;
  if (!jobs.length) return <div className="generated-empty"><span>这里还没有成品</span><p>去聊天页上传一张照片，让 bobo 先替你生成一页。</p></div>;
  return <div className="generated-archive-grid">{jobs.map((job, index) => <a className="generated-archive-card" key={job.jobId} href={job.imageUrl ?? undefined} target="_blank" rel="noreferrer">
    {job.imageUrl ? <img src={job.imageUrl} alt="私人生成作品" loading={index > 3 ? 'lazy' : 'eager'} /> : <div className="generated-archive-placeholder">生成中</div>}
    <span>{String(index + 1).padStart(2, '0')} / {job.mode === 'distillation' ? '蒸馏' : '拼贴'}</span>
  </a>)}</div>;
}

function ModeIcon({ view }: { view: View }) {
  if (view === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3.4-.9 5.7-.3 8 1.4v12c-2.3-1.7-4.6-2.3-8-1.4zM20 5.5c-3.4-.9-5.7-.3-8 1.4v12c2.3-1.7 4.6-2.3 8-1.4z" /></svg>;
  if (view === 'ring') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /></svg>;
  if (view === 'cards') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="12" height="15" rx="1" /><rect x="8" y="3" width="11" height="14" rx="1" /></svg>;
  if (view === 'atlas') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M20 12h-5M12 20v-5M4 12h5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /><path d="m7 16 3.3-3.5 2.4 2.3 2.1-2.1L19 17" /><circle cx="9" cy="9" r="1.2" /></svg>;
}

export default function BoboWorld({ onBack, onStart, baseUrl = '', signedIn = false }: { onBack: () => void; onStart: () => void; baseUrl?: string; signedIn?: boolean }) {
  const [view, setView] = useState<View>('book');
  const [jobs, setJobs] = useState<ImageJobView[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const meta = viewMeta[view];
  useEffect(() => {
    if (view !== 'works' || !signedIn) return;
    setLoadingJobs(true);
    fetchImageArchive(baseUrl).then(setJobs).finally(() => setLoadingJobs(false));
  }, [baseUrl, signedIn, view]);
  return <div className="bobo-world">
    <header className="world-header">
      <button type="button" onClick={onBack} className="world-icon-button" aria-label="返回开始页" title="返回开始页"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button>
      <div className="world-brand"><div className="world-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>bobo</strong><small>记忆档案</small></div></div>
      <button type="button" onClick={onStart} className="world-icon-button" aria-label="打开聊天" title="打开聊天"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg></button>
    </header>
    <nav className="world-dock" aria-label="相册视图">
      {views.map((item, index) => <button type="button" key={item} className={view === item ? 'is-active' : ''} onClick={() => setView(item)} aria-label={`切换到${viewMeta[item].label}视图`} aria-pressed={view === item} data-label={viewMeta[item].label}><ModeIcon view={item} /><span>{String(index + 1).padStart(2, '0')}</span></button>)}
    </nav>
    <main className="world-main">
      <div className="world-heading"><span>BOBO / {String(views.indexOf(view) + 1).padStart(2, '0')} — {meta.label}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>
      {view === 'book' ? <div className="world-book"><BoboFlipbook /></div> : view === 'ring' ? <div className="gallery-surface circular-gallery-surface"><CircularGallery items={circularGalleryItems} bend={3} textColor="#ffffff" borderRadius={0.05} scrollEase={0.02} fontUrl="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap" font="bold 30px Orbitron" /></div> : view === 'cards' ? <CardCorridor /> : view === 'atlas' ? <DomeGallerySurface /> : <WorksArchive jobs={jobs} loading={loadingJobs} signedIn={signedIn} />}
      <div className="world-gesture"><i />{meta.hint}</div>
    </main>
    <div className="world-status"><span className="world-status-dot" />正在浏览 <b>{meta.label}</b><span className="world-status-count">{String(views.indexOf(view) + 1).padStart(2, '0')} / 05</span></div>
    <span className="world-live" aria-live="polite">已切换到{meta.label}视图：{meta.title}</span>
  </div>;
}
