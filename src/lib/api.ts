import {
  type ChatEvent,
  type ConversationBrief,
  type ImageAttachment,
  type ImageJobRef,
  type RemoteMessage,
  type RemotePage,
  type Role,
  type SearchHit,
  type SummarizeResult,
} from '../types';

/**
 * 拼接后端地址：baseUrl 为空时使用同源(开发经 Vite 代理 /api → Java 后端)。
 */
export function apiUrl(path: string, baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  return b ? `${b}${path}` : path;
}

export type StreamResult = { kind: 'done' | 'error' | 'timeout'; message?: string };

export interface StreamChatOptions {
  question: string;
  sessionId: string;
  baseUrl: string;
  signal?: AbortSignal;
  attachments?: ImageAttachment[];
  onEvent: (e: ChatEvent) => void;
  /**
   * 流空闲超时（单位 ms，默认 60000）：超过该时长未收到任何新数据视为连接挂起，
   * 自动中断并返回 {kind:'timeout'}，避免 UI 永远停在「生成中」（文档 §8.7 兜底建议）。
   */
  idleTimeoutMs?: number;
}

/** 后端历史条目的前缀约定（API.md §3.4）：半角冒号 + 空格 */
const USER_PREFIX = '我: ';
const ASSISTANT_PREFIX = '助手: ';

/** 把后端历史字符串解析为角色 + 内容；无法识别的行返回 null */
export function parseHistoryLine(line: string): { role: Role; content: string } | null {
  if (line.startsWith(USER_PREFIX)) return { role: 'user', content: line.slice(USER_PREFIX.length) };
  if (line.startsWith(ASSISTANT_PREFIX))
    return { role: 'assistant', content: line.slice(ASSISTANT_PREFIX.length) };
  return null;
}

/**
 * 调用后端 SSE(POST /api/chat, text/event-stream)。
 * 使用 fetch + ReadableStream 逐行解析 `data: {...}`（兼容 \n 与 \r\n），
 * 每次收到一个事件都会回调 onEvent；以 1002(STOP)/1004(ERROR) 收尾。
 * 网络/HTTP 层面的失败以 {kind:'error'} 返回，不会抛异常。
 *
 * 解析健壮性（FRONTEND_SSE_LIVE_REQUIREMENTS.md FR-2）：
 * - 半行 JSON 跨 chunk → 按行缓冲后再解析；
 * - 多个 data: 挤在同一 chunk → 逐行循环处理；
 * - 空行 / 注释行(以 ':' 开头) / 其他字段行 → 跳过；
 * - 末尾无换行的残留 → 流关闭后补处理；
 * - 单帧 JSON 解析失败 → console.warn 跳过该帧，绝不中断整条流（FR-18）。
 *
 * 注意（API.md §4）：流式接口的业务错误几乎都是 HTTP 200 + 1004 事件，
 * 成败以「是否收到 1002 / 1004」为准，不能只看 HTTP 状态码。
 */
export async function streamChat(opts: StreamChatOptions): Promise<StreamResult> {
  const { question, sessionId, baseUrl, signal, onEvent, attachments } = opts;
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  /* --- 空闲超时兜底：每次收到新数据重置计时，超时则本地中断（§8.7） --- */
  const idleMs = Math.max(3000, opts.idleTimeoutMs ?? 60000);
  let idleHit = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIdle = () => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };
  const resetIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => {
      idleHit = true;
      controller.abort();
    }, idleMs);
  };
  resetIdle();

  /** 处理一行 SSE 数据（去掉行尾 \r、取 data: 载荷并派发事件） */
  const handleLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');
    // 空行 / 注释行(':' 开头) / 非 data 字段：跳过（事件帧之间的空行等）
    if (!line || line.startsWith(':') || !line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    try {
      onEvent(JSON.parse(payload) as ChatEvent);
    } catch (err) {
      // FR-18：单帧解析失败只告警并跳过，不影响后续事件
      console.warn('[SSE] 忽略无法解析的事件帧：', payload, err);
    }
  };

  try {
    const res = await fetch(apiUrl('/api/chat', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ question, sessionId, attachments: attachments?.length ? attachments : undefined }),
      // AgentDemo 通过 HttpOnly 匿名 Cookie 绑定会话归属；直连模式同样需要带上它。
      credentials: 'include',
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { kind: 'error', message: `后端返回 HTTP ${res.status}${body ? '：' + body.slice(0, 120) : ''}` };
    }
    if (!res.body) return { kind: 'error', message: '浏览器不支持流式响应' };

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      resetIdle(); // 收到任何新数据都视为「活动」，刷新空闲计时

      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }

    // 流关闭后可能残留最后一行（无换行符结尾），也要处理
    if (buffer) handleLine(buffer);

    return { kind: 'done' };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (idleHit) {
      // 空闲超时主动断连（区别于用户停止 / 网络错误）
      return {
        kind: 'timeout',
        message: `连接空闲超过 ${Math.round(idleMs / 1000)}s 未收到数据，已自动中断`,
      };
    }
    if (name === 'AbortError' || controller.signal.aborted) {
      return { kind: 'done', message: '已停止' };
    }
    const url = apiUrl('/api/chat', baseUrl);
    const tail = '（请确认本地 Spring Boot 后端已启动在 http://localhost:18080）';
    const msg =
      err instanceof TypeError
        ? `无法连接 ${url}${tail}`
        : err instanceof Error
          ? `${url}：${err.message}`
          : `未知错误（${url}）`;
    return { kind: 'error', message: msg };
  } finally {
    clearIdle();
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

export interface UploadPolicyResponse {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: string;
}

export interface ImageJobView extends ImageJobRef {}

/** 前端先拿短期 PostObject 策略，再把图片直接送到 OSS，不经过 Java 服务内存。 */
export async function uploadImageAsset(file: File, baseUrl: string, signal?: AbortSignal): Promise<ImageAttachment> {
  const policyResponse = await fetch(apiUrl('/api/image-assets/upload-policy', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
  });
  if (!policyResponse.ok) {
    const message = await policyResponse.text().catch(() => '');
    throw new Error(message || `获取图片上传策略失败（${policyResponse.status}）`);
  }
  const policy = (await policyResponse.json()) as UploadPolicyResponse;
  const form = new FormData();
  Object.entries(policy.fields).forEach(([key, value]) => form.append(key, value));
  form.append('file', file, file.name);
  let uploaded: Response;
  try {
    uploaded = await fetch(policy.uploadUrl, { method: 'POST', body: form, signal });
  } catch (error) {
    // 跨域上传被 OSS CORS 拦截时，浏览器通常只会返回 TypeError，
    // DevTools 里常见表现是 OSS 请求 200 但响应体为 0 B。
    if (error instanceof TypeError) {
      throw new Error(
        '图片上传被 OSS 跨域策略拦截，请在 Bucket CORS 中加入当前前端地址（例如 http://127.0.0.1:5176 和 http://localhost:5176）',
      );
    }
    throw error;
  }
  if (!uploaded.ok) {
    const message = await uploaded.text().catch(() => '');
    throw new Error(message || `图片上传 OSS 失败（${uploaded.status}）`);
  }

  const completed = await fetch(apiUrl(`/api/image-assets/${encodeURIComponent(policy.assetId)}/complete`, baseUrl), {
    method: 'POST',
    credentials: 'include',
    signal,
  });
  if (!completed.ok) throw new Error('OSS 图片校验失败，未能创建图片任务');
  return {
    assetId: policy.assetId,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  };
}

export async function fetchImageJob(jobId: string, baseUrl: string, signal?: AbortSignal): Promise<ImageJobView | null> {
  try {
    const response = await fetch(apiUrl(`/api/image-jobs/${encodeURIComponent(jobId)}`, baseUrl), {
      credentials: 'include', signal,
    });
    if (!response.ok) return null;
    const value = await response.json();
    return value && typeof value.jobId === 'string' ? value as ImageJobView : null;
  } catch {
    return null;
  }
}

export async function fetchConversationImageJobs(conversationId: string, baseUrl: string): Promise<ImageJobView[]> {
  try {
    const response = await fetch(apiUrl(`/api/image-jobs?conversationId=${encodeURIComponent(conversationId)}`, baseUrl), {
      credentials: 'include',
    });
    if (!response.ok) return [];
    const value = await response.json();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function fetchImageArchive(baseUrl: string, limit = 24): Promise<ImageJobView[]> {
  try {
    const response = await fetch(apiUrl(`/api/image-jobs/archive?limit=${Math.max(1, Math.min(50, limit))}`, baseUrl), {
      credentials: 'include',
    });
    if (!response.ok) return [];
    const value = await response.json();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * 停止后端生成：POST /api/chat/stop?sessionId=xxx
 * 返回请求是否成功送达（后端幂等：会话不在生成中同样返回 stopped:true）。
 * 按 API.md §3.3：调用后应等 1002 自然收尾，不要立刻本地 abort；
 * 仅在本函数返回 false（后端不可达）时由上层本地 abort 兜底。
 */
export async function stopGeneration(sessionId: string, baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/chat/stop?sessionId=${encodeURIComponent(sessionId)}`, baseUrl), {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 清空后端记忆：DELETE /api/chat/history?sessionId=xxx */
export async function clearRemoteHistory(sessionId: string, baseUrl: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, baseUrl), {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    /* 后端未启动时静默失败 */
  }
}

/** 拉取后端会话历史（每条形如 "我: ..." / "助手: ..."），失败返回空数组 */
export async function fetchRemoteHistory(sessionId: string, baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(apiUrl(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, baseUrl), {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { history?: string[] };
    return json.history ?? [];
  } catch {
    return [];
  }
}

/**
 * 探测后端是否可达（设置页“检测连通性”/首启自动识别用）。
 *
 * 不能复用 {@link fetchRemoteHistory}：它在内部把网络错误吞掉并返回空数组，
 * 会让“后端未启动”被误判成“连接成功（历史为空）”。本函数做真实的
 * GET /api/chat/history 请求，并对超时做兜底，用返回结构区分三种情况：
 * ok=true（HTTP 2xx）、ok=false+status（后端在但报错）、ok=false+status=0（不可达）。
 */
/* =====================================================================
 * 会话记忆二级存储接口（2026-09-07 后端新增，Redis 长期历史）
 * 契约见 FRONTEND_REQUIREMENTS.md §4.5 / §4.8 / §4.7
 * ===================================================================== */

/**
 * 分页查询会话历史：GET /api/chat/{sessionId}/messages?page=&size=
 *
 * 页码从 1 开始，size 默认 20；按时间升序。后端对 page<1 / size<1 有兜底。
 * {@link restoreSessionMessages} 基于本函数做「恢复会话」的分页循环。
 */
export async function fetchSessionMessagesPage(
  sessionId: string,
  page: number,
  size: number,
  baseUrl: string,
): Promise<RemotePage<RemoteMessage> | null> {
  try {
    const qs = `?page=${Math.max(1, page | 0)}&size=${Math.max(1, size | 0)}`;
    const res = await fetch(
      apiUrl(`/api/chat/${encodeURIComponent(sessionId)}/messages${qs}`, baseUrl),
      { credentials: 'include' },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as RemotePage<RemoteMessage>;
    return json && Array.isArray(json.records) ? json : null;
  } catch {
    return null;
  }
}

export interface RestoreOptions {
  /** 每页条数（默认 100，上限 200） */
  pageSize?: number;
  /**
   * 恢复上限（默认 100，文档 §7.4）。会话不超过上限时逐页取满；
   * 超过上限时只保留「时间上最近的一个连续窗口」（仍升序），保证能接着最新对话继续聊，
   * 避免把整个超长会话渲染出来。
   */
  maxRecords?: number;
}

/**
 * 按文档 §4.5（⭐恢复会话用）用分页接口循环恢复历史，替代一次性 /messages/all：
 * 先取第 1 页拿到 total，再从计算出的起始页逐页取到最后一页。
 *
 * 任一页请求失败 / 后端为旧版本（404 / 结构不符）返回 null，
 * 由调用方降级为旧文本接口 GET /history。
 */
export async function restoreSessionMessages(
  sessionId: string,
  baseUrl: string,
  options: RestoreOptions = {},
): Promise<RemoteMessage[] | null> {
  const size = Math.min(200, Math.max(1, (options.pageSize ?? 100) | 0));
  const cap = Math.max(1, (options.maxRecords ?? 100) | 0);

  const first = await fetchSessionMessagesPage(sessionId, 1, size, baseUrl);
  if (!first || !Array.isArray(first.records)) return null;

  // 超长会话：计算能覆盖「最近 cap 条」的起始页（分页粒度可能带来少量冗余，末尾统一裁剪）
  let fromPage = 1;
  if (first.total > cap) {
    const firstSeq = first.total - cap + 1; // 想保留的首条序号（从 1 起）
    fromPage = Math.max(1, Math.ceil(firstSeq / size));
  }

  const records: RemoteMessage[] = first.records;
  for (let p = fromPage; p <= first.totalPages; p++) {
    if (p === 1) continue;
    const pg = await fetchSessionMessagesPage(sessionId, p, size, baseUrl);
    if (!pg) return null;
    records.push(...pg.records);
  }

  if (records.length > cap) return records.slice(records.length - cap);
  return records;
}

/**
 * 手动触发会话压缩：POST /api/chat/{sessionId}/summarize
 *
 * 后端 LLM 对「保留最近 keep-recent 条」以外的旧历史生成 ≤max-length 字摘要，
 * 并双写 Redis 与内存窗口（幂等：消息太少或上次摘要后新积累不足返回 summarized=false）。
 * 返回 null 表示请求失败（后端不可达 / 非 200）。
 */
export async function requestSummarize(
  sessionId: string,
  baseUrl: string,
): Promise<SummarizeResult | null> {
  try {
    const res = await fetch(
      apiUrl(`/api/chat/${encodeURIComponent(sessionId)}/summarize`, baseUrl),
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) return null;
    return (await res.json()) as SummarizeResult;
  } catch {
    return null;
  }
}

/* =====================================================================
 * 会话记忆检索（API.md §4.9 / §4.10，契约已定稿；后端实现前接口 404）
 * 按 A8 约定：后端未实现/不可达时静默降级（返回 null / 空数组），UI 不弹错。
 * ===================================================================== */

/** GET /api/chat/search 的查询参数（API.md §4.9，全部可选） */
export interface SearchMessagesParams {
  /** 全文关键词（作用于 content TEXT 字段）；省略/空串 = 不做全文过滤 */
  q?: string;
  /** 原始 sessionId（本地会话 id）；省略 = 跨会话全局搜索 */
  sessionId?: string;
  /** USER / ASSISTANT / SYSTEM / TOOL，精确匹配；省略 = 不限 */
  messageType?: string;
  /** 起始时间（epoch 毫秒，闭区间） */
  from?: number;
  /** 结束时间（epoch 毫秒，闭区间） */
  to?: number;
  /** 1-based */
  page?: number;
  /** 每页条数 */
  size?: number;
}

/**
 * 全文/条件检索：GET /api/chat/search
 * 响应为 PageResult<SearchHit>，按 seq 倒序（最新优先）。
 * 网络失败 / HTTP 非 2xx（含后端未实现 404）→ 返回 null，由 UI 静默降级为空态。
 */
export async function searchMessages(
  params: SearchMessagesParams,
  baseUrl: string,
): Promise<RemotePage<SearchHit> | null> {
  try {
    const qs = new URLSearchParams();
    if (typeof params.q === 'string' && params.q.trim()) qs.set('q', params.q.trim());
    if (typeof params.sessionId === 'string' && params.sessionId.trim())
      qs.set('sessionId', params.sessionId.trim());
    if (typeof params.messageType === 'string' && params.messageType)
      qs.set('messageType', params.messageType);
    if (typeof params.from === 'number' && Number.isFinite(params.from))
      qs.set('from', String(Math.trunc(params.from)));
    if (typeof params.to === 'number' && Number.isFinite(params.to))
      qs.set('to', String(Math.trunc(params.to)));
    const page = Math.max(1, (params.page ?? 1) | 0);
    const size = Math.max(1, Math.min(200, (params.size ?? 20) | 0));
    qs.set('page', String(page));
    qs.set('size', String(size));

    const res = await fetch(apiUrl(`/api/chat/search?${qs.toString()}`, baseUrl), {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RemotePage<SearchHit>;
    return json && Array.isArray(json.records) ? json : null;
  } catch {
    return null;
  }
}

/**
 * 拉取后端会话列表：GET /api/chat/conversations
 * 返回元素 sessionId 已剥离 chat- 前缀，可直接作为搜索/恢复的入参。
 * 网络失败 / 接口未实现（404）→ 返回空数组，UI 降级为仅展示本地会话。
 */
export async function fetchRemoteConversations(baseUrl: string): Promise<ConversationBrief[]> {
  try {
    const res = await fetch(apiUrl('/api/chat/conversations', baseUrl), {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { total?: number; conversations?: ConversationBrief[] };
    const list = Array.isArray(json?.conversations) ? json.conversations : [];
    return list.filter(
      (c) => c && typeof c.sessionId === 'string' && c.sessionId,
    ) as ConversationBrief[];
  } catch {
    return [];
  }
}
