import type { Conversation, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const CONV_KEY = 'travel-agent.conversations.v1';
const SETTINGS_KEY = 'travel-agent.settings.v1';
/** 最近选中的会话 id（刷新后自动恢复，对应 FRONTEND_REQUIREMENTS.md §1.3 的 agent.currentSessionId） */
const ACTIVE_SESSION_KEY = 'travel-agent.activeSessionId.v1';

function scopedKey(key: string, scope = 'guest'): string {
  const safe = scope.trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, '_') || 'guest';
  return `${key}.${safe}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadConversations(scope = 'guest'): Conversation[] {
  try {
    const raw = localStorage.getItem(scopedKey(CONV_KEY, scope));
    if (!raw) return [];
    const arr = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({ ...c, messages: Array.isArray(c.messages) ? c.messages : [] }));
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[], scope = 'guest'): void {
  try {
    // OSS 结果地址是短期签名 URL：不把它持久化，刷新时由后端重新签发，
    // 避免把过期地址留在 localStorage，也避免把可访问链接长期留在本地。
    const snapshot = list.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => ({
        ...message,
        imageJobs: message.imageJobs?.map(({ imageUrl: _imageUrl, ...job }) => job),
      })),
    }));
    localStorage.setItem(scopedKey(CONV_KEY, scope), JSON.stringify(snapshot));
  } catch {
    /* 存储满/隐私模式时忽略 */
  }
}

export function saveActiveSessionId(id: string | null, scope = 'guest'): void {
  try {
    const key = scopedKey(ACTIVE_SESSION_KEY, scope);
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadActiveSessionId(scope = 'guest'): string | null {
  try {
    return localStorage.getItem(scopedKey(ACTIVE_SESSION_KEY, scope));
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      // 清理旧版本可能保存的公网地址，始终使用本地后端。
      baseUrl: DEFAULT_SETTINGS.baseUrl,
      demoMode: typeof s.demoMode === 'boolean' ? s.demoMode : DEFAULT_SETTINGS.demoMode,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 从文本取会话标题：取第一行、去 markdown、截断 */
export function deriveTitle(text: string, max = 18): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '新对话';
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}
