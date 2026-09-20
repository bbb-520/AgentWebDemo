import { useEffect, useRef, useState } from 'react';
import type {
  ChatEvent,
  ChatMsg,
  Conversation,
  EndReason,
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
  fetchSessionMessagesPage,
  parseHistoryLine,
  requestSummarize,
  restoreSessionMessages,
  streamChat,
} from '../lib/api';
import { runMockAgent } from '../lib/mock';
import { mergeRemoteMsgs, remoteToChatMsgs } from '../lib/remote';
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
export function useConversations({ settings, notify, openSettings }: UseConversationsOptions) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyInfo | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  /** 强制重跑「空会话自动恢复」的令牌（重复点选同一会话时也能重试） */
  const [hydrateTick, setHydrateTick] = useState(0);
  /** 搜索跳转定位目标：ChatArea 渲染完成后滚到 data-seq 并闪烁（API.md §7.2 F6/A6） */
  const [jumpTarget, setJumpTarget] = useState<{ convId: string; seq: number; nonce: number } | null>(null);
  const jumpNonceRef = useRef(0);

  // 最新值镜像：供异步闭包 / mount 期 effect 读取，避免 stale closure
  const listRef = useRef(conversations);
  const busyRef = useRef<BusyInfo | null>(null);
  const activeRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const notifyRef = useRef(notify);
  const openSettingsRef = useRef(openSettings);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const summarizeRef = useRef(false);

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

  /* ---------- 会话列表持久化（首帧跳过，后续防抖 260ms） ---------- */
  const persistReadyRef = useRef(false);
  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    const t = setTimeout(() => saveConversations(conversations), 260);
    return () => clearTimeout(t);
  }, [conversations]);

  /** 切换当前会话并记住（seed 预览会话不记，避免无 hash 场景误恢复演示数据） */
  const applyActive = (id: string) => {
    setActiveId(id);
    if (!id.startsWith('seed')) saveActiveSessionId(id);
  };

  /* ---------- 启动：预览种子（#seed-demo）优先于自动恢复 ---------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash.includes('seed-demo')) return;
    const now = Date.now();
    const seededId = 'seed-demo';
    const conv: Conversation = {
      id: seededId,
      title: '北京天气·直播演示',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'seed-sum',
          role: 'system',
          content:
            '用户先咨询北京当日的实时天气并计划出行；助手调用天气与景点两个工具，给出晴朗、18~29°C、西北风 3 级的实况，并结合晴天筛选出故宫博物院、八达岭长城、颐和园三个推荐景点，最后补充了昼夜温差大、早晚加衣的出行建议。',
          status: 'done',
          summaryMeta: {
            summarizedCount: 6,
            rangeStart: new Date(now - 4 * 3600_000).toISOString(),
            rangeEnd: new Date(now - 900_000).toISOString(),
          },
          createdAt: now - 600_000,
        },
        {
          id: 'seed-user',
          role: 'user',
          content: '北京今天天气怎么样？适合去哪玩？',
          createdAt: now,
        },
        {
          id: 'seed-asst',
          role: 'assistant',
          status: 'done',
          createdAt: now + 1,
          startedAt: now,
          finishedAt: now + 5200,
          conversationId: 'chat-seed-demo',
          thinking: [
            '需要先获取 北京 的实时天气数据。',
            '当前 北京 天气为「晴」，据此筛选适合的景点。',
          ],
          toolCalls: [
            {
              localId: 'tc-w',
              toolName: 'getWeather',
              argumentsRaw: '{"city":"北京"}',
              status: 'ok',
              result:
                '北京今日晴，气温 18 ~ 29°C（当前约 26°C），湿度 41%，西北风 3 级。秋高气爽，昼夜温差较大，早晚记得加一件薄外套。',
            },
            {
              localId: 'tc-a',
              toolName: 'getAttraction',
              argumentsRaw: '{"city":"北京","weather":"晴"}',
              status: 'ok',
              result:
                '已从 4 个候选中按天气筛出 3 个：故宫博物院、八达岭长城、颐和园。',
            },
          ],
          usage: { promptTokens: 142, completionTokens: 268, totalTokens: 410, durationMs: 5200 },
          content:
            '为你查到 **北京** 的实时天气（模拟数据）：\n\n> ☀️ 北京今日晴，气温 18 ~ 29°C（当前约 26°C），湿度 41%，西北风 3 级。秋高气爽，昼夜温差较大，早晚记得加一件薄外套。\n\n结合 北京 当前天气，推荐这几个地方：\n\n1. **故宫博物院** — 历史底蕴深厚，秋日红墙金瓦光影极佳（适合晴☀️）\n2. **八达岭长城** — 能见度高，登高望远视野开阔（适合晴☀️）\n3. **颐和园** — 昆明湖畔微风不燥，适合散步与游船（适合晴或多云⛅）\n\n— —\n\n💡 小贴士：秋高气爽，昼夜温差较大，早晚记得加一件薄外套。 建议把需要户外观光的安排在上午，中午炎热时段安排室内或用餐。',
        },
      ],
    };
    setConversations((ls) => (ls.some((c) => c.id === seededId) ? ls : [conv, ...ls]));
    setActiveId(seededId);
  }, []);

  /* ---------- 启动：自动恢复上次会话（FR-1.3 / agent.currentSessionId） ---------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.includes('seed-demo')) return;
    const last = loadActiveSessionId();
    if (!last || last.startsWith('seed')) return;
    if (!listRef.current.some((c) => c.id === last)) return;
    applyActive(last);
    setHydrateTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================================================================
   * 空会话恢复：选中（或自动恢复）一个「本地无消息」的会话时，从后端拉历史。
   * 以 activeId / hydrateTick 为触发，重复点选同一空会话也能重试。
   * ===================================================================== */
  useEffect(() => {
    if (!activeId) return;
    const conv = listRef.current.find((c) => c.id === activeId);
    if (!conv || conv.messages.length > 0) return;
    if (settingsRef.current.demoMode) return;
    void hydrateConv(activeId);
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
    if (settingsRef.current.demoMode) return;

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

  /* ---------- 发送（含 SSE/Mock 统一状态机） ---------- */
  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;

    let convId = activeRef.current ?? '';
    const exists = listRef.current.some((c) => c.id === convId);
    if (!exists) {
      convId = uid();
      applyActive(convId);
    }

    const now = Date.now();
    const userMsg: ChatMsg = { id: uid(), role: 'user', content: text, createdAt: now };
    const asstMsg: ChatMsg = {
      id: uid(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now + 1,
      startedAt: now,
    };

    // 注入用户消息 + 空助手消息（同时承担新会话的首次创建）
    setConversations((ls) => {
      const has = ls.some((c) => c.id === convId);
      const conv: Conversation = {
        id: convId,
        title: deriveTitle(text),
        messages: [userMsg, asstMsg],
        createdAt: now,
        updatedAt: now,
      };
      return has
        ? ls.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title: c.title === '新对话' ? deriveTitle(text) : c.title,
                  messages: [...c.messages, userMsg, asstMsg],
                  updatedAt: now,
                }
              : c,
          )
        : [conv, ...ls];
    });

    const convId2 = convId;
    const asstId = asstMsg.id;
    const wasDemo = settingsRef.current.demoMode;
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
    const addThinking = (line: string) =>
      patchAsst((m) => ({ ...m, thinking: [...(m.thinking ?? []), line] }));

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
     * - 演示模式：直接本地 abort；
     * - 真实模式：当前后端只提供 POST /api/chat，没有独立的 /stop 端点，
     *   因此直接中断浏览器流；后端会按连接异常保存已生成的部分消息。
     */
    const requestStop = () => {
      if (settled || stopRequested) return;
      stopRequested = true;
      if (wasDemo) {
        controller.abort();
        finish('stopped', { endReason: 'stopped_by_user' });
        return;
      }
      controller.abort();
    };

    activeRunRef.current = { convId: convId2, msgId: asstId, requestStop };
    setBusy({ convId: convId2, msgId: asstId });

    /** 全量事件分派：演示模式与真实后端共用同一套状态逻辑 */
    const onLiveEvent = (e: ChatEvent) => {
      switch (e.eventType) {
        case EVENT.DATA:
          if (typeof e.eventData === 'string' && e.eventData) pushText(e.eventData);
          break;
        case EVENT.REASONING: {
          if (typeof e.eventData === 'string') {
            const line = e.eventData.trim();
            if (line) addThinking(line);
          }
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
      if (wasDemo) {
        const res = await runMockAgent(convId2, text, controller.signal, { onEvent: onLiveEvent });
        if (!settled) {
          finish(res.kind === 'aborted' ? 'stopped' : 'done', {
            endReason: res.kind === 'aborted' ? 'stopped_by_user' : 'stop',
          });
        }
        return;
      }

      const res = await streamChat({
        question: text,
        sessionId: convId2, // 会话 id 即后端 sessionId，对话/停止/历史/清空统一携带
        baseUrl: settingsRef.current.baseUrl,
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
    setConversations((ls) => ls.filter((c) => c.id !== id));
    if (activeRef.current === id) {
      setActiveId(null);
      saveActiveSessionId(null);
    }
  };

  const clearContext = () => {
    const conv = listRef.current.find((c) => c.id === activeRef.current);
    if (!conv || busyRef.current) return;
    setConversations((ls) =>
      ls.map((c) => (c.id === conv.id ? { ...c, messages: [], updatedAt: Date.now() } : c)),
    );
    notifyRef.current('已清空当前会话');
  };

  /* ---------- 总结当前会话（POST /api/chat/{sessionId}/summarize，文档 §7.6） ---------- */
  const summarizeActive = async () => {
    const conv = listRef.current.find((c) => c.id === activeRef.current);
    if (!conv || conv.messages.length === 0 || busyRef.current || summarizeRef.current) return;
    if (settingsRef.current.demoMode) {
      notifyRef.current('演示模式没有后端记忆可压缩，请先切到直连后端', 'err');
      return;
    }

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

  /* ---------- 搜索跳转（API.md §7.2 F6 / 验收 A6-A7） ---------- */

  /** 触发一次定位：ChatArea 渲染到 data-seq 节点后滚动 + 闪烁（nonce 保证重复跳同一 seq 也生效） */
  const fireJump = (convId: string, seq: number) => {
    jumpNonceRef.current += 1;
    setJumpTarget({ convId, seq, nonce: jumpNonceRef.current });
  };

  /**
   * 从搜索结果跳到指定会话的某条历史消息：
   * 1) 目标会话不在本地列表（后端独有，如 chat-default）→ 自动建一个本地会话壳；
   * 2) 切到该会话；本地窗口已含该 seq → 直接定位；
   * 3) 否则按 seq 计算所在页补拉（fetchSessionMessagesPage）并入列表，toast「已加载所在片段」。
   * 接口不可用（后端未实现 / 未启动，验收 A8）→ 静默提示，不崩。
   */
  const jumpToSeq = async (sessionId: string, seq: number) => {
    const convId = sessionId.trim();
    const s = Math.trunc(seq);
    const validSeq = Number.isFinite(s) && s >= 1 ? s : 0; // 旧数据可能无 seq：0 = 无法精确定位
    if (!convId) return;
    if (busyRef.current?.convId === convId) {
      notifyRef.current('该会话正在生成回答，请先停止再跳转', 'err');
      return;
    }

    // ① 自动建会话壳（后端独有会话首次点击时本地化）
    if (!listRef.current.some((c) => c.id === convId)) {
      const now = Date.now();
      setConversations((ls) =>
        ls.some((c) => c.id === convId)
          ? ls
          : [{ id: convId, title: '新对话', messages: [], createdAt: now, updatedAt: now }, ...ls],
      );
    }
    applyActive(convId);
    if (!validSeq) return; // 无 seq：仅切到会话，空壳由自动恢复（hydrate）拉最近历史

    // ② 等一帧让 React 落库，读取最新本地消息列表
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const conv = listRef.current.find((c) => c.id === convId);
    if (!conv) return; // 防御：理论上不存在

    // ③ 本地窗口已含目标条 → 直接定位
    if (conv.messages.some((m) => m.seq === validSeq)) {
      fireJump(convId, validSeq);
      return;
    }
    if (settingsRef.current.demoMode) {
      notifyRef.current('演示模式没有后端历史可跳转，请先切到直连后端', 'err');
      return;
    }

    // ④ 目标在当前窗口之外（超长会话只恢复了最近片段）→ 补拉所在页
    const page = Math.ceil(validSeq / 100); // 补拉页 size 固定 100（与恢复策略一致）
    const pg = await fetchSessionMessagesPage(convId, page, 100, settingsRef.current.baseUrl);
    if (!pg || !Array.isArray(pg.records) || pg.records.length === 0) {
      notifyRef.current('目标会话历史不可用（后端未启动或尚未实现分页/搜索接口）', 'err');
      return;
    }
    const built = remoteToChatMsgs(pg.records);
    if (!built || built.msgs.length === 0) {
      notifyRef.current('目标片段无可用内容', 'err');
      return;
    }
    const hadLocal = conv.messages.length > 0;
    setConversations((ls) =>
      ls.map((c) =>
        c.id !== convId
          ? c
          : { ...c, messages: mergeRemoteMsgs(c.messages, built.msgs), updatedAt: Date.now() },
      ),
    );
    notifyRef.current(
      hadLocal
        ? '目标消息在窗口外，已补拉所在片段并并入当前列表'
        : '已加载目标消息所在片段',
    );
    fireJump(convId, validSeq);
  };

  return {
    conversations,
    activeId,
    busy,
    summarizing,
    jumpTarget,
    send,
    stop,
    select,
    newChat,
    removeConversation,
    clearContext,
    summarizeActive,
    jumpToSeq,
  };
}
