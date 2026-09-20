import type { Conversation, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const CONV_KEY = 'travel-agent.conversations.v1';
const SETTINGS_KEY = 'travel-agent.settings.v1';
/** 最近选中的会话 id（刷新后自动恢复，对应 FRONTEND_REQUIREMENTS.md §1.3 的 agent.currentSessionId） */
const ACTIVE_SESSION_KEY = 'travel-agent.activeSessionId.v1';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
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

export function saveConversations(list: Conversation[]): void {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(list));
  } catch {
    /* 存储满/隐私模式时忽略 */
  }
}

export function saveActiveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function loadActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

/** 用户是否曾经保存过设置（用于区分“首次启动”与“用户已主动选择过运行模式”） */
export function hasSavedSettings(): boolean {
  try {
    return localStorage.getItem(SETTINGS_KEY) != null;
  } catch {
    // 存储不可用（隐私模式/被禁用）时视为“未知”，默认不做自动切换
    return true;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : DEFAULT_SETTINGS.baseUrl,
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
