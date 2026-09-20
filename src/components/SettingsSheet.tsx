import { useEffect, useState } from 'react';
import type { Settings } from '../types';
import { probeBackend } from '../lib/api';
import { IconClose } from './icons';

interface Props {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  onClose: () => void;
}

type CheckState = { kind: 'idle' | 'checking' | 'ok' | 'bad'; text?: string };

export default function SettingsSheet({ settings, onChange, onClose }: Props) {
  const [urlText, setUrlText] = useState(settings.baseUrl);
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });

  useEffect(() => {
    setUrlText(settings.baseUrl);
    setCheck({ kind: 'idle' });
  }, [settings.baseUrl]);

  const pickMode = (demoMode: boolean) => {
    onChange({ demoMode });
    setCheck({ kind: 'idle' });
  };

  const doCheck = async () => {
    setCheck({ kind: 'checking' });
    const result = await probeBackend(urlText.trim());
    if (result.ok) {
      setCheck({ kind: 'ok', text: result.message });
    } else {
      setCheck({ kind: 'bad', text: result.message });
    }
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
        <div className="sheet-sub">运行模式与后端连接配置，修改后即时生效并自动保存</div>

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
                对接 bobo(Spring Boot) 的 SSE 接口，后端负责记忆、Qwen 与天气/景点工具编排。
              </div>
            </button>
          </div>
        </div>

        {!settings.demoMode && (
          <div className="set-sec">
            <div className="set-sec-title">后端地址</div>
            <div className="field">
              <label>Base URL（留空 = 同源）</label>
              <input
                value={urlText}
                placeholder="例如 http://localhost:18080"
                spellCheck={false}
                onChange={(e) => setUrlText(e.target.value)}
                onBlur={() => onChange({ baseUrl: urlText.trim() })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <div className="hint">
                留空时走同源：开发环境由 Vite 代理到 Java 后端，生产环境把本前端放进 Spring Boot
                的 static 目录由后端托管。
              </div>
              <div className="chip-row">
                {[
                  { label: '同源（留空）', v: '' },
                  { label: '18080（文档默认）', v: 'http://localhost:18080' },
                  { label: '8080', v: 'http://localhost:8080' },
                ].map((c) => (
                  <button
                    key={c.label}
                    className="chip"
                    onClick={() => {
                      setUrlText(c.v);
                      onChange({ baseUrl: c.v });
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn-ghost" onClick={doCheck} disabled={check.kind === 'checking'}>
                  {check.kind === 'checking' ? '检测中…' : '检测后端连通性'}
                </button>
                {check.kind === 'ok' && (
                  <span className="check-line">
                    <b className="ok">✓</b> {check.text}
                  </span>
                )}
                {check.kind === 'bad' && (
                  <span className="check-line">
                    <b className="bad">✕</b> {check.text}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
