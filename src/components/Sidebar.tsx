import { useRef } from 'react';
import type { Conversation } from '../types';
import { fmtAgo } from '../lib/format';
import { AgentOrb } from './Avatar';
import { IconGear, IconPlus, IconTrash } from './icons';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  demoMode: boolean;
  baseUrl: string;
  width: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onWidthChange?: (width: number) => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;

export default function Sidebar({
  conversations,
  activeId,
  demoMode,
  baseUrl,
  width,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onWidthChange,
}: Props) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      onWidthChange?.(next);
    };

    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sb-brand">
        <AgentOrb size={32} />
        <div>
          <div className="sb-brand-name">
            AgentDemo <span className="sb-badge">AGENT</span>
          </div>
        </div>
      </div>

      <button className="sb-new" onClick={onNew}>
        <IconPlus size={16} />
        新建对话
      </button>

      {sorted.length > 0 && <div className="sb-list-label">最近会话</div>}
      <div className="sb-list dark-scroll">
        {sorted.map((c) => (
          <div
            key={c.id}
            className={`sb-item${c.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="sb-item-dot" />
            <span className="sb-item-title">{c.title || '新对话'}</span>
            <span className="sb-item-time">{fmtAgo(c.updatedAt)}</span>
            <span
              role="button"
              aria-label="删除会话"
              className="sb-item-del"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <IconTrash size={14} />
            </span>
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <span className={`sb-mode ${demoMode ? 'demo' : 'live'}`}>
          <span className="dot" />
          {demoMode ? '演示模式 · 本地模拟' : baseUrl ? `已连 ${hostOf(baseUrl)}` : '直连后端 · 同源'}
        </span>
        <button className="icon-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
          <IconGear size={16} />
        </button>
      </div>

      <div className="sb-resizer" onMouseDown={startResize} title="拖动调整宽度" aria-label="拖动调整侧边栏宽度" />
    </aside>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}
