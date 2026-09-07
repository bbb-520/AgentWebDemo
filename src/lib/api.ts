import { EVENT, type ChatEvent, type Role } from '../types';

/**
 * 拼接后端地址：baseUrl 为空时使用同源(开发经 Vite 代理 /api → Java 后端)。
 */
export function apiUrl(path: string, baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  return b ? `${b}${path}` : path;
}

export type StreamResult = { kind: 'done' | 'error'; message?: string };

export interface StreamChatOptions {
  question: string;
  sessionId: string;
  baseUrl: string;
  signal?: AbortSignal;
  onEvent: (e: ChatEvent) => void;
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
  const { question, sessionId, baseUrl, signal, onEvent } = opts;
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

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
      body: JSON.stringify({ question, sessionId }),
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
    if (name === 'AbortError' || controller.signal.aborted) {
      return { kind: 'done', message: '已停止' };
    }
    const url = apiUrl('/api/chat', baseUrl);
    const tail = baseUrl
      ? '（跨源直连可能被浏览器 CORS 拦截，Base URL 留空走 Vite /api 代理即可）'
      : '（请求目标：本页同源 + Vite 代理 → http://localhost:18080）';
    const msg =
      err instanceof TypeError
        ? `无法连接 ${url}${tail}`
        : err instanceof Error
          ? `${url}：${err.message}`
          : `未知错误（${url}）`;
    return { kind: 'error', message: msg };
  } finally {
    if (signal) signal.removeEventListener('abort', onOuterAbort);
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
    });
  } catch {
    /* 后端未启动时静默失败 */
  }
}

/** 拉取后端会话历史（每条形如 "我: ..." / "助手: ..."），失败返回空数组 */
export async function fetchRemoteHistory(sessionId: string, baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(apiUrl(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, baseUrl));
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
export interface ProbeResult {
  ok: boolean;
  /** HTTP 状态码；网络层失败/超时为 0 */
  status: number;
  message: string;
}

export async function probeBackend(baseUrl: string, timeoutMs = 3000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer =
    typeof setTimeout !== 'undefined'
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  try {
    // sessionId 用一次性值，避免与真实会话混淆（GET 不会在后端创建会话）
    const res = await fetch(
      apiUrl(`/api/chat/history?sessionId=probe-${Date.now()}`, baseUrl),
      { signal: controller.signal },
    );
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok ? '后端可达，历史接口正常' : `后端返回 HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: aborted
        ? `连接超时（>${timeoutMs}ms）`
        : baseUrl.trim()
          ? '无法连接：请确认后端已启动且地址无误'
          : '无法连接（当前请求经 Vite 代理 /api → 后端 18080）',
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 便于复用，导出事件常量 */
export { EVENT };
