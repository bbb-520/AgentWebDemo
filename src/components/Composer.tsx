import { useRef, type KeyboardEvent, type CompositionEvent } from 'react';
import { IconSend, IconStop } from './icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  demoMode: boolean;
}

export default function Composer({ value, onChange, onSend, onStop, running, demoMode }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 176) + 'px';
  };

  const submit = () => {
    if (running) return;
    const v = value.trim();
    if (!v) return;
    onChange('');
    requestAnimationFrame(() => taRef.current && (taRef.current.style.height = 'auto'));
    onSend();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onCompositionStart = (e: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = true;
    void e;
  };
  const onCompositionEnd = (e: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    void e;
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          placeholder={running ? '智能体正在回答…' : '问天气、要推荐，或让我帮你规划一段行程…'}
          onChange={(e) => {
            onChange(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          disabled={running}
        />
        <div className="composer-row">
          <div className="composer-hint">
            {demoMode ? (
              <span className="demo-chip">演示模式</span>
            ) : (
              <span style={{ color: 'var(--ok)' }}>● 直连后端</span>
            )}
            <span>Enter 发送 · Shift+Enter 换行</span>
          </div>
          {running ? (
            <button className="send-btn stop" onClick={onStop} title="停止生成" aria-label="停止生成">
              <IconStop size={17} />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={submit}
              disabled={!value.trim()}
              title="发送"
              aria-label="发送"
            >
              <IconSend size={17} style={{ marginLeft: 1 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
