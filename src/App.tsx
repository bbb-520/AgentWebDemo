import { lazy, Suspense, useEffect, useState } from 'react';
import { useConversations } from './hooks/useConversations';
import { useSettings } from './hooks/useSettings';
import { useToasts } from './hooks/useToasts';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsSheet from './components/SettingsSheet';
import StartPage from './components/StartPage';
import SetupGuide from './components/SetupGuide';
import OnboardingBubbles from './components/OnboardingBubbles';
import UserProfileSheet from './components/UserProfileSheet';
import { getMe, type AuthUser } from './lib/auth';

const BoboWorld = lazy(() => import('./components/BoboWorld'));
const AboutBobo = lazy(() => import('./components/AboutBobo'));

type Page = 'start' | 'chat' | 'settings' | 'about' | 'world' | 'profile';

function pageFromHash(): Page {
  const hash = window.location.hash.replace(/^#/, '');
  return hash === 'chat' || hash === 'settings' || hash === 'about' || hash === 'world' || hash === 'profile' ? hash : 'start';
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const { toasts, push, dismissToast } = useToasts();
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    const onPop = () => setPage(pageFromHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    setAuthChecking(true);
    getMe(settings.baseUrl).then(setUser).catch(() => setUser(null)).finally(() => setAuthChecking(false));
  }, [settings.baseUrl]);

  const goto = (next: Page) => {
    const hash = next === 'start' ? '' : `#${next}`;
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    setPage(next);
  };

  const openChat = () => {
    goto('chat');
    if (!user) setLoginOpen(true);
  };

  const chat = useConversations({
    settings,
    accountScope: user?.userId ?? user?.username ?? 'guest',
    notify: push,
    openSettings: () => goto('settings'),
  });
  const activeConv = chat.conversations.find((conversation) => conversation.id === chat.activeId) ?? null;
  const title = activeConv?.title === '新对话' && activeConv.messages.length === 0 ? 'bobo' : activeConv?.title ?? 'bobo';

  return (
    <>
      {page === 'start' ? (
        <StartPage onStart={openChat} onOpenLogin={() => setLoginOpen(true)} onOpenAbout={() => goto('about')} onOpenWorld={() => goto('world')} />
      ) : page === 'about' ? (
        <Suspense fallback={<div className="world-view-loading" aria-hidden="true" />}><AboutBobo onBack={() => goto('start')} onStart={openChat} baseUrl={settings.baseUrl} /></Suspense>
      ) : page === 'world' ? (
        <Suspense fallback={<div className="world-loading">正在打开 Bobo’s World…</div>}><BoboWorld onBack={() => goto('start')} onStart={openChat} baseUrl={settings.baseUrl} /></Suspense>
      ) : page === 'settings' ? (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => goto('chat')} user={user} onLoggedOut={() => { setUser(null); goto('start'); }} />
      ) : page === 'profile' ? (
        <UserProfileSheet user={user} baseUrl={settings.baseUrl} onClose={() => goto('chat')} />
      ) : (
        <div className={`app${navOpen ? ' nav-open' : ''}`}>
          <div className="sidebar-mask" onClick={() => setNavOpen(false)} />
          <Sidebar
            conversations={chat.conversations}
            activeId={chat.activeId}
            width={sidebarWidth}
            onSelect={(id) => { chat.select(id); setNavOpen(false); }}
            onNew={() => { chat.newChat(); setNavOpen(false); }}
            onDelete={chat.removeConversation}
            onOpenSettings={() => goto('settings')}
            onWidthChange={setSidebarWidth}
            onGoHome={() => goto('start')}
          />
          <ChatArea
            title={title}
            messages={activeConv?.messages ?? []}
            busy={chat.busy !== null}
            baseUrl={settings.baseUrl}
            signedIn={Boolean(user)}
            summarizing={chat.summarizing}
            onSend={chat.send}
            onStop={chat.stop}
            onClear={chat.clearContext}
            onSummarize={chat.summarizeActive}
            onOpenSettings={() => goto('settings')}
            onOpenLogin={() => setLoginOpen(true)}
            onGoHome={() => goto('start')}
            onOpenProfile={() => goto('profile')}
            user={user}
            onToggleNav={() => setNavOpen((value) => !value)}
          />
        </div>
      )}

      {loginOpen && <SetupGuide baseUrl={settings.baseUrl} onLoggedIn={(nextUser) => { setUser(nextUser); setLoginOpen(false); goto('chat'); }} onClose={() => setLoginOpen(false)} />}
      {page === 'chat' && user && !authChecking && <OnboardingBubbles scope={user.userId ?? user.username} onOpenProfile={() => goto('profile')} />}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.kind === 'err' ? ' err' : ''}`}>
            <span>{toast.text}</span>
            {toast.actionLabel && <button onClick={() => { toast.onAction?.(); dismissToast(toast.id); }}>{toast.actionLabel}</button>}
          </div>
        ))}
      </div>
    </>
  );
}
