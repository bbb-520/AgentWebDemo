import { useCallback, useState } from 'react';
import type { Settings } from '../types';
import { loadSettings, saveSettings } from '../lib/storage';

/**
 * 本地运行模式设置。后端地址固定为 http://localhost:18080，不再支持公网部署地址。
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const ns = { ...s, ...p };
      saveSettings(ns);
      return ns;
    });
  }, []);

  return { settings, updateSettings };
}
