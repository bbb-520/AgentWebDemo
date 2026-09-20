import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Conversation, SearchHit } from '../types';
import { fetchRemoteConversations, searchMessages } from '../lib/api';
import { fmtStamp } from '../lib/format';
import { IconClose, IconSearch } from './icons';

/**
 * 会话记忆搜索面板（API.md §4.9 / §7.2 F4）。
 *
 * - 输入防抖 300ms，用递增请求序号丢弃过期响应（防快速改词时旧结果覆盖新结果）；
 * - 会话范围 = 全部（跨会话）/ 指定会话（本地 + 后端独有，后端 4.10 未实现时 remote 为空）；
 * - 高亮走「⟦ ⟧ 哨兵切分渲染」，禁止 dangerouslySetInnerHTML（§2.4 安全约定）；
 * - 点击结果 → onJumpToSeq(sessionId, seq)：由 useConversations 切会话 + 定位/补拉；
 * - 后端未实现 / 不可达时（searchMessages 返回 null）静默降级为空态提示，不弹错不崩（验收 A8）。
 */
interface Props {
  demoMode: boolean;
  baseUrl: string;
  /** 本地会话列表（用于「指定会话」范围与结果显示的会话名） */
  conversations: Conversation[];
  onClose: () => void;
  /** 跳到某条后端历史（sessionId 已剥离 chat- 前缀，与本地会话 id 同构） */
  onJumpToSeq: (sessionId: string, seq: number) => void;
}

type TimeRangeKey = '' | '1d' | '7d' | '30d';
const DAY = 86_400_000;
const TIME_RANGES: { k: TimeRangeKey; label: string; ms: number }[] = [
  { k: '', label: '全部时间', ms: 0 },
  { k: '1d', label: '近 1 天', ms: DAY },
  { k: '7d', label: '近 7 天', ms: 7 * DAY },
  { k: '30d', label: '近 30 天', ms: 30 * DAY },
];
const TYPE_OPTS = [
  { value: '', label: '全部角色' },
  { value: 'USER', label: 'USER · 提问' },
  { value: 'ASSISTANT', label: 'ASSISTANT · 回答' },
  { value: 'SYSTEM', label: 'SYSTEM · 摘要' },
  { value: 'TOOL', label: 'TOOL · 工具' },
];
const TYPE_LABEL: Record<string, string> = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
  TOOL: 'TOOL',
};
const PAGE_SIZE = 20;

const TYPE_CLASS: Record<string, string> = {
  USER: 't-user',
  ASSISTANT: 't-assistant',
  SYSTEM: 't-system',
  TOOL: 't-tool',
};

function shortId(id: string, n = 10): string {
  return id.length > n + 3 ? `${id.slice(0, n)}…` : id;
}

/** 内部键 chat-xxx → 本地会话 id（裸 sessionId），非 chat- 前缀原样返回 */
function toSessionId(conversationId: string): string {
  return conversationId.startsWith('chat-') ? conversationId.slice(5) : conversationId;
}

/**
 * 高亮片段按哨兵切分渲染：⟦ 开 → ⟧ 关，中间的文本用 <mark> 包裹。
 * （修正 API.md §2.4 示例里「奇数段为命中」的错误注释——split 后命中段其实在下标 2、4…，
 * 必须用开关状态而非固定下标判断，否则会把哨兵外的普通文本也标亮。）
 */
function HighlightSnippet({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let inMark = false;
  text.split(/([⟦⟧])/).forEach((seg, i) => {
    if (seg === '⟦') {
      inMark = true;
      return;
    }
    if (seg === '⟧') {
      inMark = false;
      return;
    }
    if (inMark) nodes.push(<mark key={i}>{seg}</mark>);
    else if (seg) nodes.push(seg);
  });
  return <>{nodes}</>;
}

/** 截断片段时若截断点落在 ⟦ 高亮内，补一个 ⟧ 防「开启未闭合」导致整段被标亮 */
function trimSnippet(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const open = (cut.match(/⟦/g) || []).length;
  const close = (cut.match(/⟧/g) || []).length;
  return cut + (open > close ? '⟧' : '') + '…';
}

export default function SearchSheet({
  demoMode,
  baseUrl,
  conversations,
  onClose,
  onJumpToSeq,
}: Props) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState(''); // '' = 全部会话（跨会话检索）
  const [msgType, setMsgType] = useState('');
  const [timeKey, setTimeKey] = useState<TimeRangeKey>('');

  const [items, setItems] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  /** 重试令牌：点击「重试」时 +1 重新触发搜索 effect */
  const [retryTick, setRetryTick] = useState(0);

  const reqSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasAnyFilter = q.trim() !== '' || scope !== '' || msgType !== '' || timeKey !== '';

  /* ---------- 挂载：拉后端会话列表（4.10 未实现时返回空，静默降级） ---------- */
  const [remoteOnly, setRemoteOnly] = useState<{ sessionId: string }[]>([]);
  useEffect(() => {
    if (demoMode) return;
    let alive = true;
    fetchRemoteConversations(baseUrl).then((list) => {
      if (alive && list.length) setRemoteOnly(list.map((c) => ({ sessionId: c.sessionId })));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, baseUrl]);

  const scopeOpts = useMemo(() => {
    const seen = new Set<string>();
    const local = conversations
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      })
      .map((c) => ({
        value: c.id,
        label: c.title && c.title !== '新对话' ? c.title : shortId(c.id),
      }));
    const remote = remoteOnly
      .filter((r) => !seen.has(r.sessionId))
      .map((r) => ({ value: r.sessionId, label: `后端会话 · ${shortId(r.sessionId)}` }));
    return { local, remote };
  }, [conversations, remoteOnly]);

  const convLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    scopeOpts.local.forEach((o) => m.set(o.value, o.label));
    scopeOpts.remote.forEach((o) => m.set(o.value, o.label));
    return m;
  }, [scopeOpts]);

  /* ---------- 搜索参数 → 发起请求（filter effect 内联，防抖 300ms + 序号丢弃） ---------- */
  useEffect(() => {
    if (demoMode) return;
    if (!hasAnyFilter) {
      // 条件全部清空：废弃在途请求、复位 loading，回到引导态
      ++reqSeq.current;
      setSearching(false);
      setLoadingMore(false);
      setFailed(false);
      setStarted(false);
      setItems([]);
      setTotal(0);
      setPage(1);
      return;
    }
    const seq = ++reqSeq.current;
    setSearching(true);
    setFailed(false);
    setStarted(true);
    const from = timeKey ? Date.now() - TIME_RANGES.find((t) => t.k === timeKey)!.ms : undefined;
    const timer = window.setTimeout(async () => {
      const res = await searchMessages(
        {
          q,
          sessionId: scope || undefined,
          messageType: msgType || undefined,
          from,
          page: 1,
          size: PAGE_SIZE,
        },
        baseUrl,
      );
      if (seq !== reqSeq.current) return; // 过期响应：期间条件已变，丢弃
      setSearching(false);
      if (!res) {
        setFailed(true);
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(res.records);
      setTotal(res.total);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope, msgType, timeKey, retryTick, demoMode, baseUrl]);

  /* ---------- 加载更多（append 下一页） ---------- */
  const loadMore = async () => {
    if (demoMode || searching || loadingMore || failed) return;
    const next = page + 1;
    const seqAtStart = reqSeq.current;
    setLoadingMore(true);
    const from = timeKey ? Date.now() - TIME_RANGES.find((t) => t.k === timeKey)!.ms : undefined;
    const res = await searchMessages(
      { q, sessionId: scope || undefined, messageType: msgType || undefined, from, page: next, size: PAGE_SIZE },
      baseUrl,
    );
    setLoadingMore(false);
    if (seqAtStart !== reqSeq.current) return; // 条件已变，列表即将被新搜索替换
    if (!res || !res.records.length) return; // 静默：无更多或失败，保持现有列表
    setItems((prev) => [...prev, ...res.records]);
    setTotal(res.total);
    setPage(next);
  };

  const hasMore = items.length > 0 && items.length < total;

  const jump = (hit: SearchHit) => {
    const sid = toSessionId(hit.conversationId);
    onJumpToSeq(sid, hit.seq ?? 0);
    onClose();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="sheet sheet-search" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>搜索记忆</h2>
          <button className="icon-btn light" onClick={onClose} aria-label="关闭">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet-sub">检索 Redis 长期会话历史；点结果可跳回对话并定位到该条</div>

        {/* 关键词 */}
        <div className="search-box">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            placeholder="输入关键词，如：天气 / 景点 / 杭州…（留空 = 按下方筛选浏览）"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* 筛选行 */}
        <div className="search-filters">
          <select className="sel" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="会话范围">
            <option value="">全部会话（跨会话）</option>
            {scopeOpts.local.length > 0 && (
              <optgroup label="本地会话">
                {scopeOpts.local.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
            {scopeOpts.remote.length > 0 && (
              <optgroup label="仅后端可见会话">
                {scopeOpts.remote.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select className="sel" value={msgType} onChange={(e) => setMsgType(e.target.value)} aria-label="消息角色">
            {TYPE_OPTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="chip-row">
            {TIME_RANGES.map((t) => (
              <button
                key={t.k}
                className={`chip${timeKey === t.k ? ' sel' : ''}`}
                onClick={() => setTimeKey(t.k)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 状态与结果 */}
        {!hasAnyFilter && (
          <div className="search-hint">
            输入关键词、或选择一个会话 / 角色 / 时间范围后开始检索。演示模式不提供入口。
          </div>
        )}
        {hasAnyFilter && searching && (
          <div className="search-hint">
            <span className="spin" /> 检索中…
          </div>
        )}
        {failed && (
          <div className="search-hint err">
            检索接口暂不可用（后端未启动，或 agentDemo1_0 尚未实现 GET /api/chat/search）。
            <button className="btn-ghost" onClick={() => setRetryTick((t) => t + 1)}>
              重试
            </button>
          </div>
        )}
        {started && !searching && !failed && items.length === 0 && (
          <div className="search-hint">没有匹配的历史消息</div>
        )}

        {items.length > 0 && (
          <>
            <div className="search-count">
              共 {total} 条匹配，按时间倒序（最新优先）
            </div>
            <ul className="search-hits">
              {items.map((hit) => {
                const sid = toSessionId(hit.conversationId);
                const snippet = trimSnippet(hit.highlight ?? hit.content);
                return (
                  <li
                    key={hit.conversationId + '-' + (hit.seq ?? hit.timestamp)}
                    className="search-hit"
                    role="button"
                    tabIndex={0}
                    onClick={() => jump(hit)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        jump(hit);
                      }
                    }}
                  >
                    <div className="hit-top">
                      <span className="hit-conv">{convLabelMap.get(sid) ?? shortId(sid)}</span>
                      <span className={`hit-type ${TYPE_CLASS[hit.messageType] ?? ''}`}>
                        {TYPE_LABEL[hit.messageType] ?? hit.messageType}
                      </span>
                      {typeof hit.seq === 'number' && <span className="hit-seq">#{hit.seq}</span>}
                      <span className="hit-time">{fmtStamp(hit.timestamp)}</span>
                    </div>
                    <div className="hit-text">
                      <HighlightSnippet text={snippet} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="search-more">
                <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
