import { useEffect, useState } from 'react';
import { useConversations } from './hooks/useConversations';
import { useSettings } from './hooks/useSettings';
import { useToasts } from './hooks/useToasts';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsSheet from './components/SettingsSheet';
import SearchSheet from './components/SearchSheet';
import StartPage from './components/StartPage';
import LoginSheet from './components/LoginSheet';
import { getMe, type AuthUser } from './lib/auth';

/** 两个页面：开始页（Landing）与聊天页，用 hash 路由（#chat）保持可分享/可后退 */
type Page = 'start' | 'chat';

function pageFromHash(): Page {
  return window.location.hash.replace(/^#/, '') === 'chat' ? 'chat' : 'start';
}

/**
 * 应用外壳：只保留布局与 UI 局部状态，
 * 会话/设置/提示逻辑分别收敛到 hooks/useConversations、useSettings、useToasts。
 */
export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const onPop = () => setPage(pageFromHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const goto = (next: Page) => {
    window.history.pushState(
      null,
      '',
      next === 'chat' ? '#chat' : window.location.pathname + window.location.search,
    );
    setPage(next);
  };

  const { toasts, push, dismissToast } = useToasts();
  const { settings, updateSettings } = useSettings(push);

  useEffect(() => {
    if (settings.demoMode) { setUser(null); setAuthChecking(false); return; }
    setAuthChecking(true);
    getMe(settings.baseUrl).then(setUser).catch(() => setUser(null)).finally(() => setAuthChecking(false));
  }, [settings.baseUrl, settings.demoMode]);
  const chat = useConversations({
    settings,
    notify: push,
    openSettings: () => setSettingsOpen(true),
  });

  const { conversations, activeId, busy, summarizing, jumpTarget } = chat;
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  const title = activeConv
    ? activeConv.title === '新对话' && activeConv.messages.length === 0
      ? 'bobo'
      : activeConv.title
    : 'bobo';

  return (
    <>
      {page === 'start' ? (
        <StartPage onStart={() => goto('chat')} demoMode={settings.demoMode} />
      ) : (
        <div className={`app${navOpen ? ' nav-open' : ''}`}>
          <div className="sidebar-mask" onClick={() => setNavOpen(false)} />
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            demoMode={settings.demoMode}
            baseUrl={settings.baseUrl}
            width={sidebarWidth}
            onSelect={(id) => {
              chat.select(id);
              setNavOpen(false);
            }}
            onNew={() => {
              chat.newChat();
              setNavOpen(false);
            }}
            onDelete={chat.removeConversation}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onWidthChange={setSidebarWidth}
            onGoHome={() => goto('start')}
          />
          <ChatArea
            title={title}
            messages={activeConv?.messages ?? []}
            busy={busy !== null}
            demoMode={settings.demoMode}
            summarizing={summarizing}
            jump={jumpTarget && jumpTarget.convId === activeId ? jumpTarget : null}
            onSend={chat.send}
            onStop={chat.stop}
            onClear={chat.clearContext}
            onSummarize={chat.summarizeActive}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleNav={() => setNavOpen((v) => !v)}
            onSwitchToLive={() => {
              updateSettings({ demoMode: false });
              push('已切到直连后端，请重新发送问题');
            }}
          />

          {searchOpen && !settings.demoMode && (
            <SearchSheet
              demoMode={false}
              baseUrl={settings.baseUrl}
              conversations={conversations}
              onClose={() => setSearchOpen(false)}
              onJumpToSeq={(sessionId, seq) => {
                void chat.jumpToSeq(sessionId, seq);
              }}
            />
          )}

          {settingsOpen && (
            <SettingsSheet
              settings={settings}
              onChange={updateSettings}
              onClose={() => setSettingsOpen(false)}
              user={user}
              onLoggedOut={() => setUser(null)}
            />
          )}
        </div>
      )}

      {!settings.demoMode && !authChecking && !user && (
        <LoginSheet baseUrl={settings.baseUrl} onLoggedIn={setUser} />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}>
            <span>{t.text}</span>
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.onAction?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
