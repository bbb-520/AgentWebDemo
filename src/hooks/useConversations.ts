import { useEffect, useRef, useState } from 'react';
import type {
  ChatEvent,
  ChatMsg,
  Conversation,
  EndReason,
  ImageAttachment,
  ImageJobEventData,
  ImageJobRef,
  SessionInfoData,
  Settings,
  ToolCallFailedData,
  ToolCallItem,
  ToolCallResultData,
  ToolCallStartedData,
  UsageData,
} from '../types';
import { EVENT } from '../types';
import {
  fetchRemoteHistory,
  parseHistoryLine,
  requestSummarize,
  restoreSessionMessages,
  streamChat,
  fetchConversationImageJobs,
  fetchImageJob,
  uploadImageAsset,
} from '../lib/api';
import { remoteToChatMsgs } from '../lib/remote';
import {
  deriveTitle,
  loadActiveSessionId,
  loadConversations,
  saveActiveSessionId,
  saveConversations,
  uid,
} from '../lib/storage';
import type { PushToast } from './useToasts';

interface BusyInfo {
  convId: string;
  msgId: string;
}

/** 当前进行中的一次生成：停止时中断浏览器 SSE 流，并保留已生成内容。 */
interface ActiveRun {
  convId: string;
  msgId: string;
  requestStop: () => void;
}

/** DATA 增量用 rAF 节流提交，避免逐条高频 setState（文档 FR-7） */
const RAF =
  typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb: () => void) => window.setTimeout(cb, 16);
const CAF =
  typeof cancelAnimationFrame !== 'undefined'
    ? cancelAnimationFrame
    : (id: number) => window.clearTimeout(id);

interface UseConversationsOptions {
  settings: Settings;
  accountScope?: string;
  notify: PushToast;
  openSettings: () => void;
}

/**
 * 会话状态中枢：会话列表（localStorage 持久化）、当前选中会话、单在途请求 busy 标记，
 * 以及全部会话动作（发送/停止/选择恢复/新建/删除/清空/总结）。
 *
 * 核心不变量（FRONTEND_REQUIREMENTS.md §1）：一个会话 = 一个 sessionId（uuid），
 * 只在「新建对话」时更换，刷新后自动恢复上次会话，同一时刻只允许一个在途请求。
 */
export function useConversations({ settings, accountScope = 'guest', notify, openSettings }: UseConversationsOptions) {
  const [scope, setScope] = useState(accountScope || 'guest');
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations(accountScope || 'guest'));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyInfo | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  /** 强制重跑「空会话自动恢复」的令牌（重复点选同一会话时也能重试） */
  const [hydrateTick, setHydrateTick] = useState(0);

  // 最新值镜像：供异步闭包 / mount 期 effect 读取，避免 stale closure
  const listRef = useRef(conversations);
  const busyRef = useRef<BusyInfo | null>(null);
  const activeRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const notifyRef = useRef(notify);
  const openSettingsRef = useRef(openSettings);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const summarizeRef = useRef(false);
  const imagePollersRef = useRef(new Map<string, number>());
  /**
   * Object URLs are intentionally not persisted to localStorage, but they must
   * survive the attachment replacement that happens after the upload API
   * returns. Keep them keyed by message id so a late async update cannot turn
   * an already visible image into a blank placeholder.
   */
  const attachmentPreviewRef = useRef(new Map<string, string>());

  const restoreAttachmentPreviews = (items: Conversation[]) =>
    items.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => {
        if (!message.attachments?.length) return message;
        const previewUrl = attachmentPreviewRef.current.get(message.id);
        if (!previewUrl) return message;
        const attachments = message.attachments.map((attachment) =>
          attachment.previewUrl ? attachment : { ...attachment, previewUrl },
        );
        return { ...message, attachments };
      }),
    }));

  const releaseAttachmentPreviews = (messages: ChatMsg[]) => {
    messages.forEach((message) => {
      const previewUrl = attachmentPreviewRef.current.get(message.id);
      if (!previewUrl) return;
      URL.revokeObjectURL(previewUrl);
      attachmentPreviewRef.current.delete(message.id);
    });
  };

  useEffect(() => {
    listRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);
  useEffect(() => {
    openSettingsRef.current = openSettings;
  }, [openSettings]);

  useEffect(() => () => {
    imagePollersRef.current.forEach((timer) => window.clearInterval(timer));
    imagePollersRef.current.clear();
    attachmentPreviewRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    attachmentPreviewRef.current.clear();
  }, []);

  /* ---------- 会话列表持久化（首帧跳过，后续防抖 260ms） ---------- */
  const persistReadyRef = useRef(false);
  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    const t = setTimeout(() => saveConversations(conversations, scope), 260);
    return () => clearTimeout(t);
  }, [conversations, scope]);

  useEffect(() => {
    const nextScope = accountScope || 'guest';
    if (nextScope === scope) return;
    const nextConversations = restoreAttachmentPreviews(loadConversations(nextScope));
    setScope(nextScope);
    setConversations(nextConversations);
    setActiveId(null);
    const last = loadActiveSessionId(nextScope);
    if (last && nextConversations.some((c) => c.id === last)) {
      setActiveId(last);
      setHydrateTick((t) => t + 1);
    }
  }, [accountScope, scope]);

  /** 切换当前会话并记住。 */
  const applyActive = (id: string) => {
    setActiveId(id);
    saveActiveSessionId(id, scope);
  };

  /* ---------- 启动：自动恢复上次会话（FR-1.3 / agent.currentSessionId） ---------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = loadActiveSessionId(scope);
    if (!last || last.startsWith('seed')) return;
    if (!listRef.current.some((c) => c.id === last)) return;
    applyActive(last);
    setHydrateTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  /* =====================================================================
   * 空会话恢复：选中（或自动恢复）一个「本地无消息」的会话时，从后端拉历史。
   * 以 activeId / hydrateTick 为触发，重复点选同一空会话也能重试。
   * ===================================================================== */
  useEffect(() => {
    if (!activeId) return;
    const conv = listRef.current.find((c) => c.id === activeId);
    if (!conv) return;
    if (conv.messages.length === 0) void hydrateConv(activeId);
    void hydrateImageJobs(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, hydrateTick]);

  /**
   * 恢复某会话历史：
   * 1) 优先结构化分页恢复（文档 §4.5，Redis）：USER/ASSISTANT + 最新摘要卡；
   * 2) 后端为旧版本（分页接口不可用/返回空）时回退文本 /history（内存窗口）。
   */
  const hydrateConv = async (convId: string) => {
    const conv = listRef.current.find((c) => c.id === convId);
    if (!conv || conv.messages.length > 0) return;

    const baseUrl = settingsRef.current.baseUrl;
    const now = Date.now();

    // 1) 结构化恢复：分页接口 → user/assistant + 摘要卡
    const records = await restoreSessionMessages(convId, baseUrl);
    const built = records ? remoteToChatMsgs(records) : null;
    if (built && built.msgs.length > 0) {
      // 更新器内再校验一次，避免与进行中的发送/清空竞争
      setConversations((ls) =>
        ls.map((c) =>
          c.id !== convId || c.messages.length > 0
            ? c
            : { ...c, messages: built.msgs, updatedAt: now },
        ),
      );
      notifyRef.current(
        `已从后端恢复 ${built.chatCount} 条历史消息${
          built.hasSummary ? '（含会话历史摘要）' : ''
        }`,
      );
      return;
    }

    // 2) 兜底：旧后端文本 /history（返回「我: / 助手:」行）
    const rows = await fetchRemoteHistory(convId, baseUrl);
    const msgs: ChatMsg[] = [];
    rows.forEach((line, i) => {
      const parsed = parseHistoryLine(line);
      if (parsed && parsed.content) {
        msgs.push({
          id: uid(),
          role: parsed.role,
          content: parsed.content,
          status: 'done',
          createdAt: now + i,
        });
      }
    });
    if (!msgs.length) return;

    setConversations((ls) =>
      ls.map((c) =>
        c.id !== convId || c.messages.length > 0 ? c : { ...c, messages: msgs, updatedAt: now },
      ),
    );
    notifyRef.current(`已从后端恢复 ${msgs.length} 条历史消息`);
  };

  const patchJob = (convId: string, msgId: string, job: ImageJobRef) => {
    setConversations((ls) => ls.map((c) => c.id !== convId ? c : {
      ...c,
      messages: c.messages.map((m) => m.id !== msgId ? m : {
        ...m,
        imageJobs: [...(m.imageJobs ?? []).filter((item) => item.jobId !== job.jobId), job],
      }),
    }));
  };

  const watchImageJob = (convId: string, msgId: string, jobId: string) => {
    if (imagePollersRef.current.has(jobId)) return;
    const tick = async () => {
      const job = await fetchImageJob(jobId, settingsRef.current.baseUrl);
      if (!job) return;
      patchJob(convId, msgId, job);
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED' || job.status === 'EXPIRED') {
        const timer = imagePollersRef.current.get(jobId);
        if (timer) window.clearInterval(timer);
        imagePollersRef.current.delete(jobId);
        if (job.status === 'SUCCEEDED') notifyRef.current('图片已生成，结果已回到当前对话');
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3500);
    imagePollersRef.current.set(jobId, timer);
  };

  const hydrateImageJobs = async (convId: string) => {
    const jobs = await fetchConversationImageJobs(convId, settingsRef.current.baseUrl);
    if (!jobs.length) return;
    setConversations((ls) => ls.map((c) => {
      if (c.id !== convId) return c;
      const assistantIds = c.messages.filter((m) => m.role === 'assistant').map((m) => m.id);
      const fallbackId = assistantIds[assistantIds.length - 1];
      const messages = c.messages.map((m) => m);
      const target = fallbackId ? messages.findIndex((m) => m.id === fallbackId) : -1;
      if (target >= 0) {
        const fresh = new Map(jobs.map((job) => [job.jobId, job]));
        const existing = messages[target].imageJobs ?? [];
        messages[target] = {
          ...messages[target],
          // 后端返回的是新签发的短期 URL，同 ID 也要覆盖本地旧快照。
          imageJobs: [
            ...existing.map((job) => fresh.get(job.jobId) ?? job),
            ...jobs.filter((job) => !existing.some((item) => item.jobId === job.jobId)),
          ],
        };
      }
      return { ...c, messages };
    }));
    const assistantId = listRef.current.find((c) => c.id === convId)?.messages.filter((m) => m.role === 'assistant').at(-1)?.id;
    if (assistantId) jobs.filter((job) => job.status === 'QUEUED' || job.status === 'PROCESSING').forEach((job) => watchImageJob(convId, assistantId, job.jobId));
  };

  /* ---------- 发送（SSE 状态机） ---------- */
  const send = (raw: string, file?: File) => {
    const text = raw.trim();
    if ((!text && !file) || busyRef.current) return;

    let convId = activeRef.current ?? '';
    const exists = listRef.current.some((c) => c.id === convId);
    if (!exists) {
      convId = uid();
      applyActive(convId);
    }

    const now = Date.now();
    const localPreviewUrl = file ? URL.createObjectURL(file) : undefined;
    const userMsg: ChatMsg = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: now,
      attachments: file ? [{ assetId: 'pending', fileName: file.name, mimeType: file.type, fileSize: file.size, previewUrl: localPreviewUrl }] : undefined,
    };
    const asstMsg: ChatMsg = {
      id: uid(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now + 1,
      startedAt: now,
    };
    if (localPreviewUrl) attachmentPreviewRef.current.set(userMsg.id, localPreviewUrl);

    // 注入用户消息 + 空助手消息（同时承担新会话的首次创建）
    setConversations((ls) => {
      const has = ls.some((c) => c.id === convId);
      const conv: Conversation = {
        id: convId,
        title: deriveTitle(text || '图片创作'),
        messages: [userMsg, asstMsg],
        createdAt: now,
        updatedAt: now,
      };
      return has
        ? ls.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title: c.title === '新对话' ? deriveTitle(text || '图片创作') : c.title,
                  messages: [...c.messages, userMsg, asstMsg],
                  updatedAt: now,
                }
              : c,
          )
        : [conv, ...ls];
    });

    const convId2 = convId;
    const asstId = asstMsg.id;
    const controller = new AbortController();

    let settled = false;
    let stopRequested = false;
    let sawStop = false;

    /** 定向更新当前助手消息（其它消息/会话保持引用不变，利于 memo） */
    const patchAsst = (fn: (m: ChatMsg) => ChatMsg) =>
      setConversations((ls) =>
        ls.map((c) =>
          c.id !== convId2
            ? c
            : { ...c, messages: c.messages.map((m) => (m.id === asstId ? fn(m) : m)) },
        ),
      );

    const patchUser = (attachment: ImageAttachment) =>
      setConversations((ls) => ls.map((c) => c.id !== convId2 ? c : {
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== userMsg.id) return m;
          const previewUrl = m.attachments?.[0]?.previewUrl
            ?? attachment.previewUrl
            ?? attachmentPreviewRef.current.get(m.id);
          if (previewUrl) attachmentPreviewRef.current.set(m.id, previewUrl);
          return {
            ...m,
            attachments: [{ ...attachment, ...(previewUrl ? { previewUrl } : {}) }],
          };
        }),
      }));

    /* --- DATA 增量：缓冲区 + rAF 节流提交 --- */
    let textBuf = '';
    let rafId: number | null = null;
    const commitText = (delta: string) => patchAsst((m) => ({ ...m, content: m.content + delta }));
    const flushText = () => {
      if (rafId != null) {
        CAF(rafId);
        rafId = null;
      }
      if (textBuf) {
        const d = textBuf;
        textBuf = '';
        commitText(d);
      }
    };
    const pushText = (delta: string) => {
      textBuf += delta;
      if (rafId == null) {
        rafId = RAF(() => {
          rafId = null;
          const d = textBuf;
          textBuf = '';
          if (d) commitText(d);
        });
      }
    };

    /* --- 直播字段写入 --- */
    const addToolStarted = (d: ToolCallStartedData) =>
      patchAsst((m) => ({
        ...m,
        toolCalls: [
          ...(m.toolCalls ?? []),
          {
            localId: uid(),
            toolCallId: d.toolCallId || '',
            toolName: d.toolName,
            argumentsRaw: d.arguments,
            status: 'running' as const,
          } satisfies ToolCallItem,
        ],
      }));

    /** 更新最后一张匹配条件的工具卡片（RESULT/FAILED 只带 toolName，按最近一张 running 匹配） */
    const updateToolBy = (
      find: (t: ToolCallItem) => boolean,
      patch: (t: ToolCallItem) => ToolCallItem,
    ) =>
      patchAsst((m) => {
        const calls = m.toolCalls ?? [];
        let idx = -1;
        for (let i = calls.length - 1; i >= 0; i--) {
          if (find(calls[i])) {
            idx = i;
            break;
          }
        }
        if (idx < 0) return m;
        const next = calls.slice();
        next[idx] = patch(next[idx]);
        return { ...m, toolCalls: next };
      });

    const finishToolResult = (d: ToolCallResultData) =>
      updateToolBy(
        (t) => t.status === 'running' && t.toolName === d.toolName,
        (t) => ({ ...t, status: 'ok' as const, result: d.result }),
      );

    const finishToolFailed = (d: ToolCallFailedData) =>
      updateToolBy(
        (t) => t.status === 'running' && t.toolName === d.toolName,
        (t) => ({ ...t, status: 'failed' as const, error: d.error }),
      );

    const setUsage = (d: UsageData) => patchAsst((m) => ({ ...m, usage: { ...d } }));

    const setSessionInfo = (d: SessionInfoData | null) => {
      // 防御：SESSION_INFO 的 eventData 理论上是对象，跨端异常时按 null 处理
      if (d && typeof d.conversationId === 'string' && d.conversationId) {
        patchAsst((m) => (m.conversationId ? m : { ...m, conversationId: d.conversationId }));
      }
    };

    /**
     * 统一收尾：刷新文本缓冲 → 更新状态/结束原因 → 中断仍在运行的卡片 → 复位按钮。
     * 1002(STOP) 与 1004(ERROR) 均为终结信号（文档 §4.1），其余路径也走这里。
     */
    const finish = (
      status: ChatMsg['status'],
      opts: { error?: string; endReason: EndReason } = { endReason: 'stop' },
    ) => {
      if (settled) return;
      settled = true;
      flushText();
      patchAsst((m) => {
        const calls = m.toolCalls ?? [];
        const hasRunning = calls.some((t) => t.status === 'running');
        return {
          ...m,
          status,
          finishedAt: Date.now(),
          error: opts.error,
          endReason: opts.endReason,
          toolCalls: hasRunning
            ? calls.map((t) => (t.status === 'running' ? { ...t, status: 'stopped' as const } : t))
            : calls,
        };
      });
      setConversations((ls) =>
        ls.map((c) => (c.id === convId2 ? { ...c, updatedAt: Date.now() } : c)),
      );
      setBusy(null);
      activeRunRef.current = null;
      if (activeRef.current !== convId2) {
        notifyRef.current(status === 'error' ? `「${deriveTitle(text, 10)}」回答出错` : '后台会话已结束');
      }
    };

    /**
     * 停止本次生成（文档 §7.3）：
     * 直接中断浏览器流；后端会按连接异常保存已生成的部分消息。
     */
    const requestStop = () => {
      if (settled || stopRequested) return;
      stopRequested = true;
      controller.abort();
    };

    activeRunRef.current = { convId: convId2, msgId: asstId, requestStop };
    setBusy({ convId: convId2, msgId: asstId });

    /** 后端事件分派。思考过程和工具事件只用于兼容旧协议，不渲染到界面。 */
    const onLiveEvent = (e: ChatEvent) => {
      switch (e.eventType) {
        case EVENT.DATA:
          if (typeof e.eventData === 'string' && e.eventData) pushText(e.eventData);
          break;
        case EVENT.REASONING: {
          // 思考过程只兼容旧协议，产品界面不保存也不展示。
          break;
        }
        case EVENT.TOOL_CALL_STARTED: {
          const d = e.eventData as ToolCallStartedData | null;
          if (d && typeof d.toolName === 'string') addToolStarted(d);
          break;
        }
        case EVENT.TOOL_CALL_RESULT: {
          const d = e.eventData as ToolCallResultData | null;
          if (d && typeof d.toolName === 'string' && typeof d.result === 'string')
            finishToolResult(d);
          break;
        }
        case EVENT.TOOL_CALL_FAILED: {
          const d = e.eventData as ToolCallFailedData | null;
          if (d && typeof d.toolName === 'string' && typeof d.error === 'string')
            finishToolFailed(d);
          break;
        }
        case EVENT.USAGE: {
          const d = e.eventData as UsageData | null;
          if (d && typeof d === 'object' && typeof d.totalTokens === 'number') setUsage(d);
          break;
        }
        case EVENT.SESSION_INFO:
          setSessionInfo(e.eventData as SessionInfoData);
          break;
        case EVENT.IMAGE_JOB: {
          const d = e.eventData as ImageJobEventData | null;
          if (d && typeof d.jobId === 'string' && d.jobId) {
            const job: ImageJobRef = { jobId: d.jobId, status: d.status, mode: d.mode, createdAt: d.createdAt };
            patchJob(convId2, asstId, job);
            watchImageJob(convId2, asstId, d.jobId);
          }
          break;
        }
        case EVENT.STOP:
          sawStop = true;
          finish(stopRequested ? 'stopped' : 'done', {
            endReason: stopRequested ? 'stopped_by_user' : 'stop',
          });
          break;
        case EVENT.ERROR: {
          const text =
            typeof e.eventData === 'string' && e.eventData ? e.eventData : '未知错误';
          finish('error', { error: text, endReason: 'error' });
          break;
        }
        default:
          // 未知 / 预留事件（如 1003 PARAM）：安全忽略，不中断流
          break;
      }
    };

    const run = (async () => {
      let uploadedAttachment: ImageAttachment | undefined;
      if (file) {
        try {
          uploadedAttachment = await uploadImageAsset(file, settingsRef.current.baseUrl, controller.signal);
          patchUser({ ...uploadedAttachment, previewUrl: localPreviewUrl });
        } catch (error) {
          const message = error instanceof Error ? error.message : '照片上传失败';
          finish('error', { error: message, endReason: 'error' });
          return;
        }
      }

      const res = await streamChat({
        question: text,
        sessionId: convId2, // 会话 id 即后端 sessionId，对话/停止/历史/清空统一携带
        baseUrl: settingsRef.current.baseUrl,
        attachments: uploadedAttachment ? [uploadedAttachment] : undefined,
        signal: controller.signal,
        onEvent: onLiveEvent,
      });

      if (!settled) {
        if (res.kind === 'error') {
          // 请求前就失败（HTTP 非 200 / 网络不可达）
          finish('error', { error: res.message, endReason: 'error' });
          notifyRef.current('连接后端失败', 'err', {
            label: '打开设置',
            on: () => openSettingsRef.current(),
          });
        } else if (res.kind === 'timeout') {
          // 流空闲超时（60s 无数据，本地兜底断连，文档 §8.7）
          finish('stopped', { endReason: 'aborted' });
          notifyRef.current(res.message ?? '连接空闲超时，已自动中断', 'err');
        } else if (sawStop) {
          finish(stopRequested ? 'stopped' : 'done', {
            endReason: stopRequested ? 'stopped_by_user' : 'stop',
          });
        } else {
          // 流关闭但既无 1002 也无 1004：连接异常中断
          const userStopped = stopRequested;
          finish('stopped', { endReason: userStopped ? 'stopped_by_user' : 'aborted' });
          if (!userStopped) notifyRef.current('连接中断，已保留已生成的部分内容', 'err');
        }
      }
    })();
    void run;
  };

  /* ---------- 停止 ---------- */
  const stop = () => {
    activeRunRef.current?.requestStop();
  };

  /* ---------- 会话管理 ---------- */
  const select = (id: string) => {
    applyActive(id);
    setHydrateTick((t) => t + 1);
  };

  const newChat = () => {
    if (busyRef.current) return;
    const c: Conversation = {
      id: uid(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((ls) => [c, ...ls]);
    applyActive(c.id);
  };

  const removeConversation = (id: string) => {
    if (busyRef.current?.convId === id) {
      notifyRef.current('回答进行中，请先停止再删除', 'err');
      return;
    }
    const removed = listRef.current.find((conversation) => conversation.id === id);
    if (removed) releaseAttachmentPreviews(removed.messages);
    setConversations((ls) => ls.filter((c) => c.id !== id));
    if (activeRef.current === id) {
      setActiveId(null);
      saveActiveSessionId(null, scope);
    }
  };

  const clearContext = () => {
    const conv = listRef.current.find((c) => c.id === activeRef.current);
    if (!conv || busyRef.current) return;
    releaseAttachmentPreviews(conv.messages);
    setConversations((ls) =>
      ls.map((c) => (c.id === conv.id ? { ...c, messages: [], updatedAt: Date.now() } : c)),
    );
    notifyRef.current('已清空当前会话');
  };

  /* ---------- 总结当前会话（POST /api/chat/{sessionId}/summarize，文档 §7.6） ---------- */
  const summarizeActive = async () => {
    const conv = listRef.current.find((c) => c.id === activeRef.current);
    if (!conv || conv.messages.length === 0 || busyRef.current || summarizeRef.current) return;
    summarizeRef.current = true;
    setSummarizing(true);
    try {
      const res = await requestSummarize(conv.id, settingsRef.current.baseUrl);
      if (!res) {
        notifyRef.current('总结请求失败：后端不可达或接口异常', 'err');
        return;
      }
      if (!res.summarized) {
        // 后端幂等：消息太少或上次摘要后新积累不足
        notifyRef.current('当前对话较短或近期已总结，暂无需压缩');
        return;
      }
      const summaryText = res.summary ?? '';
      if (!summaryText) {
        notifyRef.current('后端未返回摘要文本');
        return;
      }
      // 本地置顶插入一张摘要卡（旧的 system 摘要卡被替换，避免重复堆叠）
      setConversations((ls) =>
        ls.map((c) =>
          c.id !== conv.id
            ? c
            : {
                ...c,
                messages: [
                  {
                    id: uid(),
                    role: 'system',
                    content: summaryText,
                    status: 'done',
                    createdAt: Date.now(),
                  },
                  ...c.messages.filter((m) => m.role !== 'system'),
                ],
                updatedAt: Date.now(),
              },
        ),
      );
      notifyRef.current('已生成会话历史摘要：更早的对话将被压缩引用，节省后续上下文');
    } finally {
      summarizeRef.current = false;
      setSummarizing(false);
    }
  };

  return {
    conversations,
    activeId,
    busy,
    summarizing,
    send,
    stop,
    select,
    newChat,
    removeConversation,
    clearContext,
    summarizeActive,
  };
}
