import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fetchBoboWorld, type BoboWorldItem } from '../lib/api';
import './bobo-world.css';

const PAGE_SIZE = 24;

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
  const [selected, setSelected] = useState<BoboWorldItem | null>(null);
  const [captionVisible, setCaptionVisible] = useState(false);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  const [thumbnailFallbackIds, setThumbnailFallbackIds] = useState<Set<string>>(() => new Set());
  const requestRef = useRef<AbortController | null>(null);

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
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error('[bobo-world] public world request failed', cause);
        setError(cause instanceof Error ? cause.message : '星图读取失败');
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
    if (!selected) return;
    setCaptionVisible(false);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let captionTimer: number | undefined;
    if (reducedMotion || !selected.hasCaption) setCaptionVisible(true);
    else {
      // Viewer fades in for 240 ms; the extra 210 ms gives its caption a clear second beat.
      captionTimer = window.setTimeout(() => setCaptionVisible(true), 450);
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { if (captionTimer !== undefined) window.clearTimeout(captionTimer); window.removeEventListener('keydown', onKeyDown); };
  }, [selected]);

  const markBroken = (itemId: string) => {
    console.warn('[bobo-world] image could not be loaded', { itemId });
    setBrokenIds((previous) => new Set(previous).add(itemId));
  };

  const handleMapImageError = (item: BoboWorldItem) => {
    if (item.thumbnailUrl && item.thumbnailUrl !== item.imageUrl && !thumbnailFallbackIds.has(item.itemId)) {
      console.warn('[bobo-world] thumbnail failed; falling back to the original image', { itemId: item.itemId });
      setThumbnailFallbackIds((previous) => new Set(previous).add(item.itemId));
      return;
    }
    markBroken(item.itemId);
  };

  return (
    <div className="bobo-world">
      <header className="world-header">
        <button type="button" onClick={onBack} className="world-icon-button" aria-label="返回开始页" title="返回开始页">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <div className="world-brand"><div className="world-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>bobo</strong><small>Bobo’s World</small></div></div>
        <button type="button" onClick={onStart} className="world-icon-button" aria-label="打开聊天" title="打开聊天">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg>
        </button>
      </header>

      <main className="world-main bobo-map-main">
        <div className="world-heading bobo-map-heading">
          <span>BOBO / PUBLIC CONSTELLATION</span>
          <h1>星图</h1>
          <p>每一张星光，都来自一次主动分享。</p>
        </div>

        {loading ? (
          <div className="world-view-loading" role="status">正在连接星图…</div>
        ) : error ? (
          <div className="bobo-world-state" role="alert">
            <strong>星图暂时无法读取</strong><p>{error}</p>
            <button type="button" onClick={() => void load(null, true)}>重新加载</button>
          </div>
        ) : items.length === 0 ? (
          <div className="bobo-world-state">
            <strong>星图还没有作品</strong><p>在聊天中生成图片后，确认加入 Bobo’s World 即可点亮第一颗星。</p>
          </div>
        ) : (
          <>
            <div className="bobo-star-map" aria-label="Bobo's World 公共作品星图">
              <div className="bobo-star-dust" aria-hidden="true" />
              {items.map((item, index) => (
                <button className="bobo-star-card" key={item.itemId} type="button" onClick={() => setSelected(item)}
                  style={{ '--star-index': index } as CSSProperties} aria-label={`查看第 ${index + 1} 张作品`}>
                  <span className="bobo-star-orbit" aria-hidden="true" />
                  {brokenIds.has(item.itemId) ? (
                    <span className="bobo-image-unavailable">图片暂不可用</span>
                  ) : (
                    <img src={thumbnailFallbackIds.has(item.itemId) ? item.imageUrl : item.thumbnailUrl || item.imageUrl} alt="Bobo’s World 公开作品" loading={index < 6 ? 'eager' : 'lazy'}
                      onError={() => handleMapImageError(item)} />
                  )}
                  <span className="bobo-star-index">{String(index + 1).padStart(2, '0')}</span>
                </button>
              ))}
            </div>
            {cursor && <div className="bobo-world-more"><button type="button" disabled={loadingMore} onClick={() => void load(cursor)}>
              {loadingMore ? '正在读取…' : '继续探索'}
            </button></div>}
          </>
        )}
      </main>

      <div className="world-status"><span className="world-status-dot" />公开星图
        <span className="world-status-count">已显示 {items.length} 张</span></div>
      <span className="world-live" aria-live="polite">Bobo’s World 星图，已显示 {items.length} 张公开作品</span>

      {selected && <div className="bobo-world-modal" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null);
      }}>
        <section className="bobo-world-viewer" role="dialog" aria-modal="true" aria-label="作品预览">
          <button type="button" className="bobo-world-close" onClick={() => setSelected(null)} aria-label="关闭预览">×</button>
          {brokenIds.has(selected.itemId) ? <div className="bobo-viewer-unavailable">图片暂不可用，请刷新星图后重试。</div> :
            <img src={selected.imageUrl} alt="Bobo’s World 公开作品大图" onError={() => markBroken(selected.itemId)} />}
          {selected.hasCaption && selected.caption && <div className={`bobo-world-caption${captionVisible ? ' is-visible' : ''}`}>
            {selected.senderName && <strong>{selected.senderName}：</strong>}{selected.caption}
          </div>}
          <span className="bobo-viewer-date">{new Date(selected.createdAt).toLocaleDateString()}</span>
        </section>
      </div>}
    </div>
  );
}
