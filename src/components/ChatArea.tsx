import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../types';
import { SUGGESTIONS } from '../types';
import { MessageItem } from './MessageItem';
import EmptyState from './EmptyState';
import Composer from './Composer';
import { IconBroom, IconGear, IconMenu } from './icons';

interface Props {
  title: string;
  messages: ChatMsg[];
  busy: boolean;
  demoMode: boolean;
  onSend: (q: string) => void;
  onStop: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onToggleNav: () => void;
  onSwitchToLive: () => void;
}

export default function ChatArea({
  title,
  messages,
  busy,
  demoMode,
  onSend,
  onStop,
  onClear,
  onOpenSettings,
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
        <div className="topbar-title">{title}</div>
        <button
          className="icon-btn light"
          onClick={onClear}
          title="清空当前会话上下文（同时清空后端记忆）"
          aria-label="清空上下文"
          disabled={isEmpty || busy}
          style={isEmpty || busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <IconBroom size={16} />
        </button>
        <button className="icon-btn light" onClick={onOpenSettings} title="设置" aria-label="设置">
          <IconGear size={16} />
        </button>
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
            当前为 <b>演示模式</b>，回答来自本地模拟数据，<b>不会请求后端</b>（所以 Java 控制台无日志）。
          </span>
          <button className="demo-banner-btn" onClick={onSwitchToLive}>
            切到真实后端 →
          </button>
        </div>
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => {
          const t = draft.trim();
          if (!t || busy) return;
          setDraft('');
          sendText(t);
        }}
        onStop={onStop}
        running={busy}
        demoMode={demoMode}
      />
    </section>
  );
}
