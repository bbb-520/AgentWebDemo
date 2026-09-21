import { useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';

export interface StudioItem {
  src: string;
  title: string;
  note: string;
  year: string;
}

type TemplateName = 'drift' | 'depth' | 'morph' | 'accordion' | 'dome' | 'circular' | 'masonry' | 'stack';

interface Props { items: StudioItem[] }

const templates: Array<{ id: TemplateName; label: string; hint: string }> = [
  { id: 'drift', label: '流动墙', hint: '漂浮的记忆' },
  { id: 'depth', label: '深度轮播', hint: '拖动切换' },
  { id: 'morph', label: '融化切片', hint: '一张照片的呼吸' },
  { id: 'accordion', label: '折叠画廊', hint: '悬停展开' },
  { id: 'dome', label: '穹顶', hint: '环绕观看' },
  { id: 'circular', label: '环形轨道', hint: '拖动旋转' },
  { id: 'masonry', label: '错落墙', hint: '照片的秩序' },
  { id: 'stack', label: '叠片', hint: '点击换页' },
];

export default function MemoryStudio({ items }: Props) {
  const [template, setTemplate] = useState<TemplateName>('depth');
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const cycle = (delta: number) => setActive((current) => (current + delta + items.length) % items.length);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
    setDrag({ x: 0, y: 0 });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) start.moved = true;
    setDrag({ x: dx, y: dy });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > 64) cycle(dx < 0 ? 1 : -1);
    if (start.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setDrag({ x: 0, y: 0 });
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => Math.max(.72, Math.min(1.36, value - event.deltaY * .0008)));
  };

  const cardStyle = (index: number) => {
    const distance = index - active;
    const wrapped = ((distance + items.length / 2) % items.length) - items.length / 2;
    return { '--distance': wrapped, '--abs-distance': Math.abs(wrapped), '--drift-y': (index - 2) * 24, '--masonry-y': index * 19 - 45 } as React.CSSProperties;
  };

  return (
    <section className="memory-studio">
      <div className="studio-heading">
        <div><p className="about-kicker">MEMORY STUDIO · 3D EDITION</p><h2>用不同的方式，<em>再看一遍。</em></h2></div>
        <p className="studio-hint">拖动切换照片 · 滚轮缩放 · 点击模板切换观看方式</p>
      </div>

      <div className={`studio-stage studio-template-${template}`} style={{ '--studio-zoom': zoom, '--drag-x': drag.x, '--drag-y': drag.y } as React.CSSProperties} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
        <div className="studio-grid" aria-hidden="true" />
        <div className="studio-orbit studio-orbit-a" aria-hidden="true" />
        <div className="studio-orbit studio-orbit-b" aria-hidden="true" />
        <div className="studio-cards">
          {items.map((item, index) => {
            const distance = index - active;
            const wrapped = ((distance + items.length / 2) % items.length) - items.length / 2;
            const style = cardStyle(index);
            return (
              <button type="button" className={`studio-card${index === active ? ' is-active' : ''}`} key={item.src} style={style} onClick={() => { if (!suppressClickRef.current) setActive(index); }} aria-label={`查看 ${item.title}`}>
                <span className="studio-card-image"><img src={item.src} alt={item.title} draggable={false} /></span>
                <span className="studio-card-label"><b>{item.title}</b><small>{item.note}</small></span>
                <span className="studio-card-index">{String(index + 1).padStart(2, '0')}</span>
              </button>
            );
          })}
        </div>
        <div className="studio-readout"><span>{String(active + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span><i />{templates.find((entry) => entry.id === template)?.hint}</div>
      </div>

      <div className="studio-controls">
        <div className="studio-template-list" role="tablist" aria-label="照片展示模板">
          {templates.map((entry) => <button key={entry.id} type="button" className={template === entry.id ? 'is-selected' : ''} onClick={() => setTemplate(entry.id)} role="tab" aria-selected={template === entry.id}>{entry.label}</button>)}
        </div>
        <div className="studio-zoom"><span>ZOOM</span><button type="button" onClick={() => setZoom((value) => Math.max(.72, value - .1))}>−</button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => setZoom((value) => Math.min(1.36, value + .1))}>＋</button></div>
      </div>
    </section>
  );
}
