import { useEffect, useRef, useState } from 'react';
import type {
  ChatEvent,
  ChatMsg,
  Conversation,
  EndReason,
  Settings,
  SessionInfoData,
  ToolCallFailedData,
  ToolCallItem,
  ToolCallResultData,
  ToolCallStartedData,
  UsageData,
} from './types';
import { EVENT } from './types';
import {
  streamChat,
  stopGeneration,
  clearRemoteHistory,
  fetchRemoteHistory,
  parseHistoryLine,
  probeBackend,
} from './lib/api';
import { runMockAgent } from './lib/mock';
import {
  uid,
  loadConversations,
  saveConversations,
  loadSettings,
  saveSettings,
  hasSavedSettings,
  deriveTitle,
} from './lib/storage';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsSheet from './components/SettingsSheet';

interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'err';
  actionLabel?: string;
  onAction?: () => void;
}

interface BusyInfo {
  convId: string;
  msgId: string;
}

/** 当前进行中的一次生成：停止时通过 requestStop 走「/stop → 等 1002 → 超时兜底」流程 */
interface ActiveRun {
  convId: string;
  msgId: string;
  requestStop: () => void;
}

/** 调用 /stop 后等待 1002 的兜底超时（后端不可达/卡住时本地中断） */
const STOP_FALLBACK_MS = 4000;

/** DATA 增量用 rAF 节流提交，避免逐条高频 setState（文档 FR-7） */
const RAF = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb: () => void) => window.setTimeout(cb, 16);
const CAF = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : (id: number) => window.clearTimeout(id);

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<BusyInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(288);

  const busyRef = useRef<BusyInfo | null>(null);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const activeRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const bootProbeRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  /* ---------- 持久化 ---------- */
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const t = setTimeout(() => saveConversations(conversations), 260);
    return () => clearTimeout(t);
  }, [conversations]);

  /**
   * 预览种子：当 URL 携带 `#seed-demo` 时，注入一条示例直播消息，
   * 用于在截图/演示场景下直接看到思考块、工具卡片与用量角标的真实渲染效果。
   * 实际用户访问无该 hash 时不会触发。
   */
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

  /**
   * 首次启动自动识别后端（对齐后端「直连为主」的用法）：
   * - 仅当用户从未保存过设置（无本地缓存）时探测，绝不覆盖用户的显式选择；
   * - 同源探测 GET /api/chat/history 成功 → 自动切到「直连后端」，
   *   避免“后端明明在跑、界面却停在本地演示模式”的割裂体验；
   * - 探测失败（后端未启动/代理未就绪）→ 保持演示模式并静默降级。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (bootProbeRef.current || hasSavedSettings()) return;
    bootProbeRef.current = true;
    let cancelled = false;
    (async () => {
      const r = await probeBackend('', 2500);
      if (!cancelled && r.ok && loadSettings().demoMode) {
        updateSettings({ demoMode: false });
        push('检测到后端服务，已自动切到「直连后端」模式');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Toast ---------- */
  const dismissToast = (id: string) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = (text: string, kind: 'info' | 'err' = 'info', action?: { label: string; on: () => void }) => {
    const id = uid();
    setToasts((ts) => [...ts.slice(-2), { id, text, kind, actionLabel: action?.label, onAction: action?.on }]);
    window.setTimeout(() => dismissToast(id), 6500);
  };

  /* ---------- 发送 ---------- */
  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;

    let convId = activeRef.current ?? '';
    const exists = conversations.some((c) => c.id === convId);
    if (!exists) {
      convId = uid();
      setActiveId(convId);
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
    const wasDemo = settings.demoMode;
    const controller = new AbortController();

    let settled = false;
    let stopRequested = false;
    let sawStop = false;
    let stopFallbackTimer: number | undefined;

    /** 定向更新当前助手消息（其它消息/会话保持引用不变，利于 memo） */
    const patchAsst = (fn: (m: ChatMsg) => ChatMsg) =>
      setConversations((ls) =>
        ls.map((c) =>
          c.id !== convId2
            ? c
            : { ...c, messages: c.messages.map((m) => (m.id === asstId ? fn(m) : m)) },
        ),
      );

    /* --- DATA 增量：缓冲区 + rAF 节流提交（FR-7） --- */
    let textBuf = '';
    let rafId: number | null = null;
    const commitText = (delta: string) =>
      patchAsst((m) => ({ ...m, content: m.content + delta }));
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

    const setUsage = (d: UsageData) =>
      patchAsst((m) => ({ ...m, usage: { ...d } }));

    const setSessionInfo = (d: SessionInfoData | null) => {
      // 防御：SESSION_INFO 的 eventData 理论上是对象，跨端异常时按 null 处理
      if (d && typeof d.conversationId === 'string' && d.conversationId) {
        patchAsst((m) => (m.conversationId ? m : { ...m, conversationId: d.conversationId }));
      }
    };

    /**
     * 统一收尾：刷新文本缓冲 → 更新状态/结束原因 → 中断仍在运行的卡片 → 复位按钮。
     * 1002(STOP) 与 1004(ERROR) 均为终结信号（文档 §4.8），其余路径也走这里。
     */
    const finish = (
      status: ChatMsg['status'],
      opts: { error?: string; endReason: EndReason } = { endReason: 'stop' },
    ) => {
      if (settled) return;
      settled = true;
      if (stopFallbackTimer !== undefined) window.clearTimeout(stopFallbackTimer);
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
        push(status === 'error' ? `「${deriveTitle(text, 10)}」回答出错` : '后台会话已结束');
      }
    };

    /**
     * 停止本次生成（API.md §3.3）：
     * - 演示模式：直接本地 abort；
     * - 真实模式：先 POST /stop，等流里 1002 自然收尾（保证 UI 与后端记忆一致）；
     *   /stop 送达失败或超过兜底时长仍未收尾，再本地 abort。
     */
    const requestStop = () => {
      if (settled || stopRequested) return;
      stopRequested = true;
      if (wasDemo) {
        controller.abort();
        finish('stopped', { endReason: 'stopped_by_user' });
        return;
      }
      void stopGeneration(convId2, settings.baseUrl).then((ok) => {
        if (!ok && !settled) controller.abort(); // 后端不可达，本地兜底中断
      });
      stopFallbackTimer = window.setTimeout(() => {
        if (!settled) controller.abort();
      }, STOP_FALLBACK_MS);
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
          // 未知 / 预留事件（如 1003 PARAM）：安全忽略，不中断流（FR-19）
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
        baseUrl: settings.baseUrl,
        signal: controller.signal,
        onEvent: onLiveEvent,
      });

      if (!settled) {
        if (res.kind === 'error') {
          // 请求前就失败（HTTP 非 200 / 网络不可达）
          finish('error', { error: res.message, endReason: 'error' });
          push('连接后端失败', 'err', {
            label: '打开设置',
            on: () => setSettingsOpen(true),
          });
        } else if (sawStop) {
          finish(stopRequested ? 'stopped' : 'done', {
            endReason: stopRequested ? 'stopped_by_user' : 'stop',
          });
        } else {
          // 流关闭但既无 1002 也无 1004：连接异常中断（FR-16）
          const userStopped = stopRequested;
          finish('stopped', { endReason: userStopped ? 'stopped_by_user' : 'aborted' });
          if (!userStopped) push('连接中断，已保留已生成的部分内容', 'err');
        }
      }
    })();
    void run;
  };

  /* ---------- 停止 ---------- */
  const stop = () => {
    activeRunRef.current?.requestStop();
  };

  /* ---------- 历史恢复（API.md §3.4）：本地为空的会话从后端拉取 ---------- */
  const hydrateFromRemote = async (convId: string) => {
    if (settings.demoMode || busyRef.current) return;
    const conv = conversations.find((c) => c.id === convId);
    if (!conv || conv.messages.length > 0) return;

    const rows = await fetchRemoteHistory(convId, settings.baseUrl);
    const now = Date.now();
    const msgs: ChatMsg[] = [];
    rows.forEach((line, i) => {
      const parsed = parseHistoryLine(line);
      if (parsed && parsed.content) {
        msgs.push({ id: uid(), role: parsed.role, content: parsed.content, status: 'done', createdAt: now + i });
      }
    });
    if (!msgs.length) return;

    // 更新器内再校验一次，避免与进行中的发送/清空竞争
    setConversations((ls) =>
      ls.map((c) =>
        c.id !== convId || c.messages.length > 0 ? c : { ...c, messages: msgs, updatedAt: now },
      ),
    );
    push(`已从后端恢复 ${msgs.length} 条历史消息`);
  };

  /* ---------- 会话管理 ---------- */
  const newChat = () => {
    if (busyRef.current) return;
    const c: Conversation = { id: uid(), title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations((ls) => [c, ...ls]);
    setActiveId(c.id);
    setNavOpen(false);
  };

  const removeConversation = (id: string) => {
    if (busyRef.current?.convId === id) {
      push('回答进行中，请先停止再删除', 'err');
      return;
    }
    setConversations((ls) => ls.filter((c) => c.id !== id));
    if (activeRef.current === id) setActiveId(null);
    if (!settings.demoMode) void clearRemoteHistory(id, settings.baseUrl);
  };

  const clearContext = () => {
    if (!activeConv || busyRef.current) return;
    setConversations((ls) =>
      ls.map((c) => (c.id === activeConv.id ? { ...c, messages: [], updatedAt: Date.now() } : c)),
    );
    if (!settings.demoMode) void clearRemoteHistory(activeConv.id, settings.baseUrl);
    push('已清空当前会话的上下文与后端记忆');
  };

  /* ---------- 设置 ---------- */
  const updateSettings = (p: Partial<Settings>) => {
    setSettings((s) => {
      const ns = { ...s, ...p };
      saveSettings(ns);
      return ns;
    });
  };

  const select = (id: string) => {
    setActiveId(id);
    setNavOpen(false);
    void hydrateFromRemote(id);
  };

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <div className="sidebar-mask" onClick={() => setNavOpen(false)} />
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        demoMode={settings.demoMode}
        baseUrl={settings.baseUrl}
        width={sidebarWidth}
        onSelect={select}
        onNew={newChat}
        onDelete={removeConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onWidthChange={setSidebarWidth}
      />
      <ChatArea
        title={activeConv ? (activeConv.title === '新对话' && activeConv.messages.length === 0 ? 'AgentDemo' : activeConv.title) : 'AgentDemo'}
        messages={activeConv?.messages ?? []}
        busy={busy !== null}
        demoMode={settings.demoMode}
        onSend={send}
        onStop={stop}
        onClear={clearContext}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleNav={() => setNavOpen((v) => !v)}
        onSwitchToLive={() => {
          updateSettings({ demoMode: false });
          push('已切到直连后端，请重新发送问题');
        }}
      />

      {settingsOpen && (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}>
            <span>{t.text}</span>
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.onAction?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
