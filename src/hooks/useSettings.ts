import { useCallback, useState } from 'react';
import type { Settings } from '../types';
import { loadSettings, saveSettings } from '../lib/storage';

/** 仅保存主题和同源后端地址；应用不再提供本地/演示模式。 */
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
