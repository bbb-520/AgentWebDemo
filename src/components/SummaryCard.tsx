import { memo, useState } from 'react';
import type { ChatMsg } from '../types';
import { fmtStamp } from '../lib/format';
import { IconChevron } from './icons';

/**
 * 会话历史摘要卡片（role='system' 专属渲染）。
 *
 * 数据来源：
 * - 会话恢复（GET /messages 分页记录）：后端 MemoryCompressionService 写入 Redis 的
 *   SystemMessage（metadata.summary=true），前端恢复时转换为一条 role='system' 消息；
 * - 主动总结（POST /summarize）：成功后本地插入一条 role='system' 消息。
 *
 * 与普通对话气泡区分：摘要代表「更早历史的压缩记忆」，用独立折叠卡片而非消息气泡展示，
 * 避免与系统提示词混淆（FRONTEND-REQUIREMENTS-会话记忆优化.md §7.3）。
 */

/** 后端摘要 SystemMessage 的固定前缀（MemoryCompressionService 写入） */
const SUMMARY_HEAD = '以下是此前对话的摘要';

/** 去掉摘要文本行首的「以下是此前对话的摘要：」说明，仅展示摘要正文 */
function cleanSummaryContent(content: string): string {
  const c = content.replace(/\u00a0/g, ' ').trim();
  if (c.startsWith(SUMMARY_HEAD)) {
    const rest = c.slice(SUMMARY_HEAD.length).replace(/^[：:\s]+/, '');
    return rest || c;
  }
  return c;
}

export const SummaryCard = memo(function SummaryCard({ msg }: { msg: ChatMsg }) {
  const [open, setOpen] = useState(true);
  const meta = msg.summaryMeta;
  const body = cleanSummaryContent(msg.content);
  const hasRange = !!(meta?.rangeStart && meta?.rangeEnd);

  return (
    <div className="msg system" data-seq={msg.seq ?? undefined}>
      <div className="msg-body">
        <div className="summary-card">
          <button
            type="button"
            className="summary-head"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="会话历史摘要"
          >
            <span className="summary-ic">🧾</span>
            <span className="summary-title">会话历史摘要</span>
            {meta?.summarizedCount != null && (
              <span className="summary-chip">覆盖 {meta.summarizedCount} 条</span>
            )}
            <IconChevron className={`live-chev${open ? ' open' : ''}`} size={15} />
          </button>

          {open && (
            <div className="summary-body">
              {body && <div className="summary-text">{body}</div>}
              {(meta?.summarizedCount != null || hasRange) && (
                <div className="summary-meta">
                  {meta?.summarizedCount != null && <span>覆盖 {meta.summarizedCount} 条消息</span>}
                  {hasRange && (
                    <span>
                      {fmtStamp(meta!.rangeStart!)} ~ {fmtStamp(meta!.rangeEnd!)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
