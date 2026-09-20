import { useCallback, useState } from 'react';
import { uid } from '../lib/storage';

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'err';
  actionLabel?: string;
  onAction?: () => void;
}

export type PushToast = (
  text: string,
  kind?: 'info' | 'err',
  action?: { label: string; on: () => void },
) => void;

/** 全局轻提示：最多保留 3 条，自动 6.5s 消失 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (text, kind = 'info', action) => {
      const id = uid();
      setToasts((ts) => [...ts.slice(-2), { id, text, kind, actionLabel: action?.label, onAction: action?.on }]);
      window.setTimeout(() => dismissToast(id), 6500);
    },
    [dismissToast],
  );

  return { toasts, push, dismissToast };
}
