import { memo, useEffect, useState, type ReactNode } from 'react';
import type { ChatMsg, ToolCallItem } from '../types';
import { fmtDuration } from '../lib/format';
import { IconChevron } from './icons';

/** 参数原始 JSON 美化；解析失败时原样返回 */
function prettyJson(raw?: string): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/* ================= 思考过程（REASONING 1007） ================= */

export const ThinkingBlock = memo(function ThinkingBlock({
  lines,
  streaming,
  keepOpen = false,
}: {
  lines: string[];
  streaming: boolean;
  /** 演示/种子场景下保持默认展开，跳过自动收起逻辑 */
  keepOpen?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [touched, setTouched] = useState(false);

  // 收尾后若无人工操作，稍作停留再自动收起，保持最终消息清爽
  useEffect(() => {
    if (keepOpen || streaming || touched || lines.length === 0) return;
    const t = window.setTimeout(() => setOpen(false), 1600);
    return () => window.clearTimeout(t);
  }, [streaming, touched, lines.length, keepOpen]);

  if (lines.length === 0) return null;

  const toggle = () => {
    setTouched(true);
    setOpen((o) => !o);
  };

  return (
    <div className={`live-think${streaming ? ' live' : ''}`}>
      <button
        type="button"
        className="live-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label="思考过程"
      >
        <span className="live-ic think-ic">🧠</span>
        <span className="live-title">思考过程</span>
        {streaming && <span className="pulse-dots"><i /><i /><i /></span>}
        <span className="live-count">{lines.length}</span>
        <IconChevron className={`live-chev${open ? ' open' : ''}`} size={15} />
      </button>
      {open && (
        <div className="think-body">
          {lines.map((t, i) => (
            <div className="think-line" key={i}>
              {t}
            </div>
          ))}
          {streaming && <span className="caret-line" />}
        </div>
      )}
    </div>
  );
});

/* ================= 工具调用卡片（1005 / 1006 / 1008） ================= */

function toolIcon(card: ToolCallItem): ReactNode {
  switch (card.status) {
    case 'running':
      return <span className="spin" />;
    case 'ok':
      return <span className="tk-ok">✓</span>;
    case 'failed':
      return <span className="tk-fail">!</span>;
    default:
      return <span className="tk-stop">–</span>;
  }
}

function toolStateLabel(card: ToolCallItem): string {
  switch (card.status) {
    case 'running':
      return '调用中…';
    case 'ok':
      return '执行完成';
    case 'failed':
      return '调用失败';
    default:
      return '已中断';
  }
}

export const ToolCard = memo(function ToolCard({ card }: { card: ToolCallItem }) {
  const [open, setOpen] = useState(true);

  const args = prettyJson(card.argumentsRaw);
  const toggle = () => setOpen((o) => !o);

  return (
    <div className={`tool-card ${card.status}`}>
      <button type="button" className="tool-head" onClick={toggle} aria-expanded={open}>
        <span className="tool-ic">{toolIcon(card)}</span>
        <code className="tool-name">{card.toolName}</code>
        {args && !open && <span className="tool-args-preview">{args.replace(/\s+/g, ' ').slice(0, 46)}</span>}
        <span className={`tool-state ${card.status}`}>{toolStateLabel(card)}</span>
        <IconChevron className={`live-chev${open ? ' open' : ''}`} size={15} />
      </button>
      {open && (
        <div className="tool-body">
          {args && (
            <div className="tool-sec">
              <div className="tool-sec-t">参数</div>
              <pre className="tool-args">{args}</pre>
            </div>
          )}
          {card.status === 'ok' && card.result && (
            <div className="tool-sec res">
              <div className="tool-sec-t">返回结果</div>
              <div className="tool-result">{card.result}</div>
            </div>
          )}
          {card.status === 'failed' && card.error && (
            <div className="tool-sec err">
              <div className="tool-sec-t">失败原因</div>
              <div className="tool-err">⚠ {card.error}</div>
            </div>
          )}
          {card.status === 'stopped' && (
            <div className="tool-sec dim">
              <div className="tool-sec-t">备注</div>
              <div className="tool-result">生成已中断，该调用未返回结果。</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const ToolCardList = memo(function ToolCardList({ calls }: { calls: ToolCallItem[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="tools">
      {calls.map((c) => (
        <ToolCard key={c.localId} card={c} />
      ))}
    </div>
  );
});

/* ================= 用量角标（USAGE 1009）+ 实时耗时 ================= */

export const LiveUsage = memo(function LiveUsage({ msg }: { msg: ChatMsg }) {
  const running = msg.status === 'streaming';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || msg.startedAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(id);
  }, [running, msg.startedAt]);

  const startedAt = msg.startedAt;
  if (startedAt == null) return null;
  // 尚未开始收尾（无 finishedAt 且非流式中）时不展示
  if (!running && msg.finishedAt == null) return null;

  const elapsed = (msg.finishedAt ?? now) - startedAt;
  const usage = msg.usage;
  const dur = usage && usage.durationMs > 0 ? usage.durationMs : elapsed;

  return (
    <div className="msg-foot">
      {running ? (
        <span className="usage-chip live">⏱ {fmtDuration(elapsed)}</span>
      ) : usage ? (
        <>
          <span className="usage-chip" title={`输入 ${usage.promptTokens} · 输出 ${usage.completionTokens}`}>
            ⏱ {fmtDuration(dur)}
          </span>
          <span className="usage-chip" title={`输入 ${usage.promptTokens} · 输出 ${usage.completionTokens}`}>
            ⚡ {usage.totalTokens} tokens
          </span>
        </>
      ) : (
        <span className="usage-chip">⏱ {fmtDuration(dur)}</span>
      )}
    </div>
  );
});

/* ================= 收尾说明（中断 / 出错保留部分内容） ================= */

export const EndNote = memo(function EndNote({ msg }: { msg: ChatMsg }) {
  if (msg.endReason === 'aborted') {
    return <div className="end-note abort">⚠ 连接中断，以上为已生成的部分内容</div>;
  }
  if (msg.endReason === 'error' && msg.content) {
    return <div className="end-note partial">✂ 回答在生成过程中中断，以上为出错前已生成的部分内容</div>;
  }
  return null;
});
