import { lazy, Suspense, useEffect, useState } from 'react';
import { useConversations } from './hooks/useConversations';
import { useSettings } from './hooks/useSettings';
import { useToasts } from './hooks/useToasts';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsSheet from './components/SettingsSheet';
import SearchSheet from './components/SearchSheet';
import StartPage from './components/StartPage';
import { getKeyStatus, getMe, type AuthUser, type KeyStatus } from './lib/auth';
import SetupGuide from './components/SetupGuide';
import UserProfileSheet from './components/UserProfileSheet';
const BoboWorld = lazy(() => import('./components/BoboWorld'));

/** 两个页面：开始页（Landing）与聊天页，用 hash 路由（#chat）保持可分享/可后退 */
type Page = 'start' | 'chat' | 'settings' | 'about';

function pageFromHash(): Page {
  const hash = window.location.hash.replace(/^#/, '');
  return hash === 'chat' || hash === 'settings' || hash === 'about' ? hash : 'start';
}

/**
 * 应用外壳：只保留布局与 UI 局部状态，
 * 会话/设置/提示逻辑分别收敛到 hooks/useConversations、useSettings、useToasts。
 */
export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [loginGuideOpen, setLoginGuideOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
      next === 'chat' ? '#chat' : next === 'settings' ? '#settings' : next === 'about' ? '#about' : window.location.pathname + window.location.search,
    );
    setPage(next);
  };

  const { toasts, push, dismissToast } = useToasts();
  const { settings, updateSettings } = useSettings();

  const handleLoggedIn = async (nextUser: AuthUser) => {
    setUser(nextUser);
    const status = await getKeyStatus(settings.baseUrl).catch(() => null);
    setKeyStatus(status);
    updateSettings({ demoMode: false });
    setSetupDismissed(true);
    setLoginGuideOpen(false);
  };

  const handleKeysSaved = (status: KeyStatus) => {
    setKeyStatus(status);
    if (status.qwenConfigured && status.tavilyConfigured) {
      updateSettings({ demoMode: false });
      setSetupDismissed(true);
      setLoginGuideOpen(false);
    }
  };

  useEffect(() => {
    setAuthChecking(true);
    getMe(settings.baseUrl).then(setUser).catch(() => { setUser(null); setKeyStatus(null); }).finally(() => setAuthChecking(false));
  }, [settings.baseUrl, settings.demoMode]);

  useEffect(() => {
    if (!user) {
      setKeyStatus(null);
      return;
    }
    getKeyStatus(settings.baseUrl).then((status) => {
      setKeyStatus(status);
      if (!settings.demoMode) setSetupDismissed(true);
    }).catch(() => setKeyStatus(null));
  }, [settings.baseUrl, settings.demoMode, user]);

  const imageAgentReady = Boolean(user);
  const runtimeSettings = { ...settings, demoMode: settings.demoMode || !imageAgentReady };
  const enterOfflineChat = () => {
    updateSettings({ demoMode: true });
    setSetupDismissed(true);
    setLoginGuideOpen(false);
    goto('chat');
  };
  const chat = useConversations({
    settings: runtimeSettings,
    accountScope: user?.username ?? 'guest',
    notify: push,
    openSettings: () => goto('settings'),
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
        <StartPage onStart={() => goto('chat')} onEnterOffline={enterOfflineChat} onOpenAbout={() => goto('about')} />
      ) : page === 'about' ? (
        <Suspense fallback={<div className="world-loading">正在打开记忆档案…</div>}>
          <BoboWorld onBack={() => goto('start')} onStart={() => goto('chat')} baseUrl={settings.baseUrl} signedIn={Boolean(user)} />
        </Suspense>
      ) : page === 'settings' ? (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          onClose={() => goto('chat')}
          user={user}
          onLoggedOut={() => { setUser(null); goto('chat'); }}
          onNeedKeys={() => { goto('chat'); setLoginGuideOpen(true); }}
          onKeysChanged={handleKeysSaved}
        />
      ) : (
        <div className={`app${navOpen ? ' nav-open' : ''}`}>
          <div className="sidebar-mask" onClick={() => setNavOpen(false)} />
          <Sidebar
            conversations={conversations}
            activeId={activeId}
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
            onOpenSettings={() => goto('settings')}
            onWidthChange={setSidebarWidth}
            onGoHome={() => goto('start')}
          />
          <ChatArea
            title={title}
            messages={activeConv?.messages ?? []}
            busy={busy !== null}
            demoMode={runtimeSettings.demoMode}
            summarizing={summarizing}
            jump={jumpTarget && jumpTarget.convId === activeId ? jumpTarget : null}
            onSend={chat.send}
            onStop={chat.stop}
            onClear={chat.clearContext}
            onSummarize={chat.summarizeActive}
            onOpenSettings={() => goto('settings')}
            onOpenLogin={() => setLoginGuideOpen(true)}
            onGoHome={() => goto('start')}
            onOpenProfile={() => setProfileOpen(true)}
            user={user}
            onToggleNav={() => setNavOpen((v) => !v)}
            onSwitchToLive={() => {
              updateSettings({ demoMode: false });
              push('已切到直连后端，请重新发送问题');
            }}
          />

          {searchOpen && !runtimeSettings.demoMode && (
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

        </div>
      )}

      {page === 'chat' && !settings.demoMode && !authChecking && !setupDismissed && !imageAgentReady && (
        <SetupGuide
          baseUrl={settings.baseUrl}
          user={user}
          keyStatus={keyStatus}
          onLoggedIn={(nextUser) => { void handleLoggedIn(nextUser); }}
          onKeysSaved={handleKeysSaved}
          onClose={() => setSetupDismissed(true)}
          onUseOffline={() => { updateSettings({ demoMode: true }); setSetupDismissed(true); }}
        />
      )}

      {page === 'chat' && loginGuideOpen && (
        <SetupGuide
          baseUrl={settings.baseUrl}
          user={user}
          keyStatus={keyStatus}
          onLoggedIn={(nextUser) => { void handleLoggedIn(nextUser); }}
          onKeysSaved={handleKeysSaved}
          onClose={() => setLoginGuideOpen(false)}
          onUseOffline={() => { updateSettings({ demoMode: true }); setLoginGuideOpen(false); }}
        />
      )}

      {profileOpen && <UserProfileSheet user={user} conversations={conversations} onClose={() => setProfileOpen(false)} />}

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
