import { useEffect, useState } from 'react';
import type { Settings } from '../types';
import { deleteKey, getKeyStatus, logout, saveKeys, type AuthUser, type KeyStatus } from '../lib/auth';
import { IconClose } from './icons';

interface Props {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  onClose: () => void;
  user: AuthUser | null;
  onLoggedOut: () => void;
  onNeedKeys?: () => void;
  onKeysChanged?: (status: KeyStatus) => void;
}

export default function SettingsSheet({ settings, onChange, onClose, user, onLoggedOut, onNeedKeys, onKeysChanged }: Props) {
  const [keys, setKeys] = useState({ qwen: '', tavily: '' });
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [keyMessage, setKeyMessage] = useState('');

  useEffect(() => {
    if (user) getKeyStatus(settings.baseUrl).then(setKeyStatus).catch(() => setKeyStatus(null));
  }, [settings.baseUrl, settings.demoMode, user]);

  const saveProviderKeys = async () => {
    setKeyMessage('');
    try {
      await saveKeys(settings.baseUrl, keys.qwen, keys.tavily);
      setKeys({ qwen: '', tavily: '' });
      const status = await getKeyStatus(settings.baseUrl);
      setKeyStatus(status);
      onKeysChanged?.(status);
      setKeyMessage('已保存到当前账号');
    } catch (e) {
      setKeyMessage(e instanceof Error ? e.message : '保存失败');
    }
  };

  const removeKey = async (provider: 'qwen' | 'tavily') => {
    try {
      await deleteKey(settings.baseUrl, provider);
      const status = await getKeyStatus(settings.baseUrl);
      setKeyStatus(status);
      onKeysChanged?.(status);
      setKeyMessage(`${provider === 'qwen' ? 'Qwen' : 'Tavily'} Key 已删除`);
    } catch (e) {
      setKeyMessage(e instanceof Error ? e.message : '删除失败');
    }
  };

  const pickMode = (demoMode: boolean) => {
    if (demoMode) return onChange({ demoMode: true });
    if (!user) return onNeedKeys?.();
    if (!keyStatus?.qwenConfigured || !keyStatus.tavilyConfigured) return onNeedKeys?.();
    onChange({ demoMode: false });
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>设置</h2>
          <button className="icon-btn light" onClick={onClose} aria-label="关闭">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet-sub">本地运行模式，修改后即时生效并自动保存</div>

        <div className="set-sec">
          <div className="set-sec-title">运行模式</div>
          <div className="mode-grid">
            <button
              className={`mode-card${settings.demoMode ? ' sel' : ''}`}
              onClick={() => pickMode(true)}
            >
              <span className="mc-t">
                <span className="mc-radio" />
                演示模式
              </span>
              <div className="mc-d">
                本地模拟智能体，展示完整步骤与流式打字效果，开箱即用、无需后端。
              </div>
            </button>
            <button
              className={`mode-card${!settings.demoMode ? ' sel' : ''}`}
              onClick={() => pickMode(false)}
            >
              <span className="mc-t">
                <span className="mc-radio" />
                直连后端
              </span>
              <div className="mc-d">
                {user ? '对接 bobo(Spring Boot) 的 SSE 接口，后端负责记忆、Qwen 与天气/景点工具编排。' : '登录并配置 Qwen、Tavily 密钥后可用。'}
              </div>
            </button>
          </div>
        </div>

        {user && (
          <div className="set-sec">
            <div className="set-sec-title">账号与模型密钥</div>
            <div className="hint">当前账号：{user.username}。已配置的 Key 默认掩码显示，可随时替换或删除。</div>
            <div className="key-status-grid">
              <div className="key-status-card"><span>Qwen</span><code>{keyStatus?.qwenApiKey ?? '未配置'}</code><button onClick={() => void removeKey('qwen')} disabled={!keyStatus?.qwenConfigured}>删除</button></div>
              <div className="key-status-card"><span>Tavily</span><code>{keyStatus?.tavilyApiKey ?? '未配置'}</code><button onClick={() => void removeKey('tavily')} disabled={!keyStatus?.tavilyConfigured}>删除</button></div>
            </div>
            <div className="field">
              <label>Qwen API Key {keyStatus?.qwenConfigured ? '（已配置，留空保持不变）' : ''}</label>
              <input type="password" value={keys.qwen} onChange={(e) => setKeys((v) => ({ ...v, qwen: e.target.value }))} autoComplete="off" />
            </div>
            <div className="field">
              <label>Tavily API Key {keyStatus?.tavilyConfigured ? '（已配置，留空保持不变）' : ''}</label>
              <input type="password" value={keys.tavily} onChange={(e) => setKeys((v) => ({ ...v, tavily: e.target.value }))} autoComplete="off" />
            </div>
            <button className="btn-ghost" onClick={() => void saveProviderKeys()}>保存模型密钥</button>
            {keyMessage && <div className="check-line">{keyMessage}</div>}
            <button className="btn-ghost" onClick={() => { void logout(settings.baseUrl).then(onLoggedOut); }}>退出登录</button>
          </div>
        )}

      </div>
    </div>
  );
}
