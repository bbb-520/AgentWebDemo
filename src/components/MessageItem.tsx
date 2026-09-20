import { memo } from 'react';
import type { ChatMsg } from '../types';
import Markdown from '../lib/markdown';
import { fmtClock } from '../lib/format';
import { AgentOrb } from './Avatar';
import { WaitingState } from './Thinking';
import { EndNote, LiveUsage, ThinkingBlock, ToolCardList } from './LiveBlocks';
import { SummaryCard } from './SummaryCard';
import { IconUser } from './icons';

function StatusBadge({ msg }: { msg: ChatMsg }) {
  if (msg.status === 'stopped')
    return (
      <span className="stat stopped">
        <i className="dot" /> 已停止
      </span>
    );
  if (msg.status === 'error')
    return (
      <span className="stat error">
        <i className="dot" /> 出错
      </span>
    );
  if (msg.status === 'done')
    return (
      <span className="stat done">
        <i className="dot" /> 完成
      </span>
    );
  if (msg.status === 'streaming' && msg.content === '')
    return (
      <span className="stat streaming">
        <i className="dot" /> 运行中
      </span>
    );
  return null;
}

export const MessageItem = memo(function MessageItem({ msg }: { msg: ChatMsg }) {
  // 会话历史摘要卡：独立于 user/assistant 气泡的居中展示（role='system'）
  if (msg.role === 'system') {
    return <SummaryCard msg={msg} />;
  }

  const isUser = msg.role === 'user';
  const isStreaming = msg.status === 'streaming';
  const hasLive = (msg.thinking?.length ?? 0) > 0 || (msg.toolCalls?.length ?? 0) > 0;
  const isSeedPreview = msg.id.startsWith('seed'); // 演示/截图场景：保持完整展开
  const hasError = !!msg.error && msg.status === 'error';

  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`} data-seq={msg.seq ?? undefined}>
      {!isUser && (
        <div className="avatar">
          <AgentOrb pulse={isStreaming && msg.content === ''} />
        </div>
      )}

      {isUser && (
        <div className="avatar av-user">
          <IconUser size={17} />
        </div>
      )}

      <div className="msg-body">
        <div className="msg-meta">
          {!isUser && <span style={{ fontWeight: 650, color: 'var(--ink-2)' }}>bobo</span>}
          <span>{fmtClock(msg.createdAt)}</span>
          <StatusBadge msg={msg} />
        </div>

        {!isUser && hasLive && (
          <div className="live-stack">
            <ThinkingBlock lines={msg.thinking ?? []} streaming={isStreaming} keepOpen={isSeedPreview} />
            <ToolCardList calls={msg.toolCalls ?? []} />
          </div>
        )}

        {isUser ? (
          <div className="bubble">{msg.content}</div>
        ) : (
          <div className="bubble-plain">
            {msg.content ? (
              <Markdown content={msg.content} />
            ) : isStreaming ? (
              !hasLive && <WaitingState />
            ) : (
              <span style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>（本轮无文本输出）</span>
            )}
            {isStreaming && msg.content && <span className="caret" />}
          </div>
        )}

        {hasError && <div className="msg-error">⚠ {msg.error}</div>}

        {!isUser && (
          <>
            <EndNote msg={msg} />
            <LiveUsage msg={msg} />
          </>
        )}
      </div>
    </div>
  );
});
