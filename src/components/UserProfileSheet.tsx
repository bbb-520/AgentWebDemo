import type { Conversation } from '../types';
import type { AuthUser } from '../lib/auth';
import { IconClose } from './icons';

interface Props { user: AuthUser | null; conversations: Conversation[]; onClose: () => void; }

function estimateTokens(conversations: Conversation[]) {
  return conversations.reduce((sum, c) => sum + c.messages.reduce((n, m) => {
    if (m.usage?.totalTokens) return n + m.usage.totalTokens;
    return n + Math.max(0, Math.ceil((m.content?.length ?? 0) / 4));
  }, 0), 0);
}

export default function UserProfileSheet({ user, conversations, onClose }: Props) {
  const total = estimateTokens(conversations);
  const prompt = conversations.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user').reduce((s, m) => s + Math.ceil((m.content.length || 0) / 4), 0), 0);
  const completion = Math.max(0, total - prompt);
  const max = Math.max(prompt, completion, 1);
  return (
    <div className="profile-mask" onClick={onClose}>
      <section className="profile-page" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><span className="profile-kicker">ACCOUNT</span><h2>{user?.username ?? '离线访客'}</h2></div><button className="icon-btn light" onClick={onClose} aria-label="关闭"><IconClose size={18} /></button></div>
        <p className="profile-sub">你的会话和用量只在当前账号下统计。</p>
        <div className="token-total"><span>已消耗 Token</span><strong>{total.toLocaleString()}</strong><small>根据当前会话内容估算，后端返回用量时优先采用后端数据。</small></div>
        <div className="token-chart" aria-label="Token 用量图表">
          <div className="token-row"><span>提问</span><div><i style={{ width: `${Math.max(3, prompt / max * 100)}%` }} /></div><b>{prompt.toLocaleString()}</b></div>
          <div className="token-row"><span>回答</span><div><i className="answer" style={{ width: `${Math.max(3, completion / max * 100)}%` }} /></div><b>{completion.toLocaleString()}</b></div>
        </div>
        <div className="profile-meta"><span>{conversations.length} 个会话</span><span>账号级统计</span></div>
      </section>
    </div>
  );
}
