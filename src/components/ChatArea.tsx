import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../types';
import { SUGGESTIONS } from '../types';
import { MessageItem } from './MessageItem';
import EmptyState from './EmptyState';
import Composer from './Composer';
import { IconBroom, IconMenu } from './icons';
import PillNav from './PillNav';
import type { AuthUser } from '../lib/auth';
import boboMark from '../assets/bobo-mark.svg';

interface Props {
  title: string;
  messages: ChatMsg[];
  busy: boolean;
  demoMode: boolean;
  /** 是否正在请求后端压缩本会话（按钮转圈禁用） */
  summarizing?: boolean;
  /** 搜索跳转目标（仅当目标会话为当前激活会话时由 App 传入；nonce 变化即触发重新定位） */
  jump?: { convId: string; seq: number; nonce: number } | null;
  onSend: (q: string, file?: File) => void;
  onStop: () => void;
  onClear: () => void;
  /** 手动触发会话压缩（POST /api/chat/{sessionId}/summarize） */
  onSummarize?: () => void;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
  onGoHome: () => void;
  onOpenProfile: () => void;
  user: AuthUser | null;
  onToggleNav: () => void;
  onSwitchToLive: () => void;
}

export default function ChatArea({
  title,
  messages,
  busy,
  demoMode,
  summarizing = false,
  jump = null,
  onSend,
  onStop,
  onClear,
  onSummarize,
  onOpenSettings,
  onOpenLogin,
  onGoHome,
  onOpenProfile,
  user,
  onToggleNav,
  onSwitchToLive,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [draft, setDraft] = useState('');

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const isEmpty = messages.length === 0;

  // 有新 token / 消息变化时自动吸底
  useEffect(() => {
    const el = scrollRef.current;
    if (el && (stickRef.current || !busy)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, busy]);

  // 搜索跳转：渲染完成后定位到 data-seq 节点并短暂高亮闪烁（API.md §7.2 F6/A6）
  // 依赖 jump 引用（nonce 变化）与消息条数（补拉落地后的首次渲染）——streaming 改内容不触发
  useEffect(() => {
    if (!jump) return;
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-seq="${jump.seq}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('seq-flash');
    const t = window.setTimeout(() => el.classList.remove('seq-flash'), 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, messages.length]);

  const sendText = (q: string) => {
    stickRef.current = true;
    onSend(q);
  };

  return (
    <section className="main">
      <header className="topbar">
        <button className="icon-btn light menu-btn" onClick={onToggleNav} aria-label="打开菜单">
          <IconMenu size={18} />
        </button>
        <div className="topbar-title">
          <span>{title}</span>
        </div>
        <button
          className="icon-btn light"
          onClick={onClear}
          title="清空当前会话"
          aria-label="清空上下文"
          disabled={isEmpty || busy}
          style={isEmpty || busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <IconBroom size={16} />
        </button>
        <PillNav
          logo={boboMark}
          logoAlt="bobo"
          items={[
            { label: '首页', href: '#start', onClick: onGoHome },
            { label: '设置', href: '#settings', onClick: onOpenSettings },
            { label: user ? user.username : '登录', href: '#profile', onClick: user ? onOpenProfile : onOpenLogin },
          ]}
          activeHref="#profile"
          ease="power2.out"
          baseColor="#17171a"
          pillColor="#fbfbfc"
          hoveredPillTextColor="#ffffff"
          pillTextColor="#17171a"
          initialLoadAnimation={false}
        />
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner">
          {isEmpty ? (
            <EmptyState onAsk={sendText} />
          ) : (
            messages.map((m) => <MessageItem key={m.id} msg={m} />)
          )}
        </div>
      </div>

      {!isEmpty && !busy && (
        <div className="quick-row" style={{ paddingBottom: 2 }}>
          {SUGGESTIONS.slice(0, 3).map((s) => (
            <button key={s.title} className="quick-chip" onClick={() => sendText(s.ask)}>
              {s.icon} {s.ask.length > 16 ? s.ask.slice(0, 15) + '…' : s.ask}
            </button>
          ))}
        </div>
      )}

      {demoMode && !busy && (
        <div className="demo-banner" role="status">
          <span className="demo-banner-ic">⚠</span>
          <span className="demo-banner-text">
            当前为 <b>本地演示</b>，回答来自模拟数据，<b>不会请求 Java 后端</b>。
          </span>
          <button className="demo-banner-btn" onClick={onSwitchToLive}>
            切到真实后端 →
          </button>
        </div>
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={(file) => {
          const t = draft.trim();
          if ((!t && !file) || busy) return;
          setDraft('');
          stickRef.current = true;
          onSend(t || '请根据这张照片进行一次有创意的二次生成。', file);
        }}
        onStop={onStop}
        running={busy}
        demoMode={demoMode}
      />
    </section>
  );
}
