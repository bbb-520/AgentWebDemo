import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '../types';
import { probeBackend } from '../lib/api';
import { hasSavedSettings, loadSettings, saveSettings } from '../lib/storage';
import type { PushToast } from './useToasts';

/**
 * 运行模式 / 后端地址设置（localStorage 持久化）。
 *
 * 首次启动自动识别后端（对齐后端「直连为主」的用法）：
 * - 仅当用户从未保存过设置（无本地缓存）时探测，绝不覆盖用户的显式选择；
 * - 同源探测 GET /api/chat 命中 405（当前后端唯一对话入口为 POST）→ 自动切到「直连后端」，
 *   避免“后端明明在跑、界面却停在本地演示模式”的割裂体验；
 * - 探测失败（后端未启动/代理未就绪）→ 保持演示模式并静默降级。
 */
export function useSettings(notify: PushToast) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const ns = { ...s, ...p };
      saveSettings(ns);
      return ns;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasSavedSettings()) return;
    let cancelled = false;
    (async () => {
      const r = await probeBackend('', 2500);
      if (!cancelled && r.ok && loadSettings().demoMode) {
        updateSettings({ demoMode: false });
        notifyRef.current('检测到后端服务，已自动切到「直连后端」模式');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateSettings]);

  return { settings, updateSettings };
}
