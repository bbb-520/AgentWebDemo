import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
const BoboFlipbook = lazy(() => import('./BoboFlipbook'));
const CircularGallery = lazy(() => import('./CircularGallery.jsx'));
const DomeGallery = lazy(() => import('./DomeGallery.jsx'));
import { createPhotoArchiveBook, fetchPhotoArchive, type PhotoArchivePhoto } from './photo-archive';
import { fetchImageArchive, type ImageJobView } from '../lib/api';
import './bobo-world.css';

type View = 'book' | 'ring' | 'atlas' | 'works';

const views: View[] = ['book', 'ring', 'atlas', 'works'];
const viewMeta: Record<View, { label: string; title: string; description: string; hint: string }> = {
  book: { label: '书册', title: '翻开一段时间', description: '打开封面，让照片按自己的节奏出现。', hint: '点击书册打开 · 方向键翻页' },
  ring: { label: '环形', title: '围着记忆走一圈', description: '沿着弧线浏览私人相册，让每一张照片重新出现。', hint: '拖动浏览 · 滚轮切换 · 方向键移动' },
  atlas: { label: '星图', title: '寻找记忆的坐标', description: '把照片铺成一座穹顶，拖动视野慢慢探索。', hint: '拖动探索 · 点击放大 · Esc 关闭' },
  works: { label: '作品', title: '让照片继续生长', description: '后台生成的成品，会在这里成为一页私人档案。', hint: '点击成品打开高清图片' },
};

function DomeGallerySurface({ images }: { images: { src: string; alt: string }[] }) {
  return <div className="gallery-surface dome-gallery-surface"><DomeGallery images={images} grayscale={false} /></div>;
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
  if (view === 'atlas') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M20 12h-5M12 20v-5M4 12h5" /></svg>;
  if (view === 'works') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /><path d="m7 16 3.3-3.5 2.4 2.3 2.1-2.1L19 17" /><circle cx="9" cy="9" r="1.2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M7 15l3-3 2.2 2 2.8-3 3 4" /><circle cx="9" cy="9" r="1" /></svg>;
}

export default function BoboWorld({ onBack, onStart, baseUrl = '', signedIn = false }: { onBack: () => void; onStart: () => void; baseUrl?: string; signedIn?: boolean }) {
  const [view, setView] = useState<View>('book');
  const [jobs, setJobs] = useState<ImageJobView[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [photos, setPhotos] = useState<PhotoArchivePhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [photoError, setPhotoError] = useState('');
  const meta = viewMeta[view];
  const archiveBook = useMemo(() => createPhotoArchiveBook(photos), [photos]);
  const circularGalleryItems = useMemo(() => photos.map((photo, index) => ({
    image: photo.src,
    text: `PHOTO ${String(index + 1).padStart(2, '0')}`,
  })), [photos]);
  const domeGalleryImages = useMemo(() => photos.map((photo) => ({ src: photo.src, alt: photo.alt })), [photos]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingPhotos(true);
    setPhotoError('');
    fetchPhotoArchive(baseUrl, controller.signal)
      .then(setPhotos)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPhotoError(error instanceof Error ? error.message : '读取相册清单失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPhotos(false);
      });
    return () => controller.abort();
  }, [baseUrl]);

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
      <Suspense fallback={<div className="world-view-loading">正在展开这一页…</div>}>
        {view === 'works' ? <WorksArchive jobs={jobs} loading={loadingJobs} signedIn={signedIn} /> : loadingPhotos ? <div className="world-view-loading">正在读取 OSS 相册清单…</div> : photoError ? <div className="world-view-loading" role="alert">读取 OSS 相册清单失败（{photoError}），请检查后端服务和 OSS ListObjects 权限。</div> : !photos.length ? <div className="world-view-loading">“one and one/”中没有找到可显示的图片。</div> : view === 'book' ? <div className="world-book"><BoboFlipbook book={archiveBook ?? undefined} /></div> : view === 'ring' ? <div className="gallery-surface circular-gallery-surface"><CircularGallery items={circularGalleryItems} bend={3} textColor="#ffffff" borderRadius={0.05} scrollEase={0.02} fontUrl="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap" font="bold 30px Orbitron" /></div> : <DomeGallerySurface images={domeGalleryImages} />}
      </Suspense>
      <div className="world-gesture"><i />{meta.hint}</div>
    </main>
    <div className="world-status"><span className="world-status-dot" />正在浏览 <b>{meta.label}</b><span className="world-status-count">{String(views.indexOf(view) + 1).padStart(2, '0')} / {String(views.length).padStart(2, '0')}</span></div>
    <span className="world-live" aria-live="polite">已切换到{meta.label}视图：{meta.title}</span>
  </div>;
}
