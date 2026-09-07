/** 与后端 ChatEventTypeEnum 对齐的事件类型（FRONTEND_SSE_LIVE_REQUIREMENTS.md §3） */
export const EVENT = {
  /** 数据事件：eventData 为最终回答文本增量 */
  DATA: 1001,
  /** 停止事件：eventData 为 null，正常/主动停止路径的收尾 */
  STOP: 1002,
  /** 参数事件（预留，后端不发，收到应忽略） */
  PARAM: 1003,
  /** 错误事件：eventData 为错误描述，也是流的终结信号 */
  ERROR: 1004,
  /** 模型决定调用某个工具：eventData 为 ToolCallStartedData */
  TOOL_CALL_STARTED: 1005,
  /** 工具返回结果：eventData 为 ToolCallResultData */
  TOOL_CALL_RESULT: 1006,
  /** 模型思考摘要：eventData 为纯文本（工具调用前，可能多条） */
  REASONING: 1007,
  /** 工具调用失败：eventData 为 ToolCallFailedData，失败后流仍会继续 */
  TOOL_CALL_FAILED: 1008,
  /** Token 用量与耗时：eventData 为 UsageData，位于 STOP 之前 */
  USAGE: 1009,
  /** 会话元信息：eventData 为 SessionInfoData，流内第一条事件 */
  SESSION_INFO: 1010,
} as const;

/** SSE 中一条 `data:` 对应的原始结构：{"eventType":1001,"eventData":"..."} */
export interface ChatEvent {
  eventType: number;
  eventData: unknown;
}

/* ---------- 各事件 eventData 的类型（文档 §4 / §9 字段约束） ---------- */

/** 1005 TOOL_CALL_STARTED */
export interface ToolCallStartedData {
  /** 该次调用的唯一 ID（可能为空串） */
  toolCallId?: string;
  toolName: string;
  /** 模型下发的参数，原始 JSON 字符串 */
  arguments?: string;
}

/** 1006 TOOL_CALL_RESULT */
export interface ToolCallResultData {
  toolName: string;
  /** 工具返回摘要，超长时后端截断为 500 字符并追加 …(已截断) */
  result: string;
}

/** 1008 TOOL_CALL_FAILED */
export interface ToolCallFailedData {
  toolName: string;
  error: string;
}

/** 1009 USAGE */
export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

/** 1010 SESSION_INFO */
export interface SessionInfoData {
  conversationId: string;
  timestamp: number;
}

export type Role = 'user' | 'assistant';

export type MsgStatus = 'streaming' | 'done' | 'stopped' | 'error';

/** 一轮结束原因：stop=正常 / error=错误 / stopped_by_user=用户中断 / aborted=连接异常 */
export type EndReason = 'stop' | 'error' | 'stopped_by_user' | 'aborted';

/** 工具调用卡片的本地状态 */
export type ToolStatus = 'running' | 'ok' | 'failed' | 'stopped';

/** 助手消息内一张「工具调用」卡片（文档 §6.2 toolCalls[]） */
export interface ToolCallItem {
  /** 前端本地唯一 ID（用于 React key） */
  localId: string;
  /** 后端下发的 toolCallId（可能为空串） */
  toolCallId?: string;
  toolName: string;
  /** 入参原始 JSON 字符串 */
  argumentsRaw?: string;
  status: ToolStatus;
  /** 1006 返回摘要 */
  result?: string;
  /** 1008 失败原因 */
  error?: string;
}

export interface ChatMsg {
  id: string;
  role: Role;
  /** 最终回答（仅 DATA 增量拼接），不含思考/工具过程文本 */
  content: string;
  status?: MsgStatus;
  error?: string;
  /** 思考过程列表（REASONING 1007，每条一行，展示用） */
  thinking?: string[];
  /** 工具调用卡片列表（1005/1006/1008 驱动） */
  toolCalls?: ToolCallItem[];
  /** Token 用量（1009，可选；缺失时 UI 隐藏） */
  usage?: UsageData | null;
  /** 后端会话键（1010 SESSION_INFO 提供） */
  conversationId?: string;
  /** 本轮结束原因（收尾语义，文档 §6.2 endReason） */
  endReason?: EndReason;
  createdAt: number;
  /** 助手消息：开始生成的时间戳 */
  startedAt?: number;
  /** 助手消息：生成结束（完成/停止/出错）的时间戳 */
  finishedAt?: number;
}

/** 一个会话 = 一个后端 sessionId（记忆上下文），加上本地持久化的消息列表 */
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMsg[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** 后端地址；留空 = 同源（开发时走 Vite 代理 /api，生产时由 Spring Boot 托管静态页） */
  baseUrl: string;
  /** 演示模式：不请求后端，用本地模拟的完整直播事件展示交互 */
  demoMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  demoMode: true,
};

export const SUGGESTIONS: { icon: string; title: string; desc: string; ask: string }[] = [
  {
    icon: '⛅',
    title: '查天气',
    desc: '北京今天天气怎么样？适不适合出门？',
    ask: '北京今天天气怎么样？适不适合出门？',
  },
  {
    icon: '🗺️',
    title: '推荐景点',
    desc: '北京晴天适合去哪里玩，推荐 3 个景点',
    ask: '北京晴天适合去哪里玩？推荐 3 个景点并说明理由',
  },
  {
    icon: '🧭',
    title: '行程规划',
    desc: '帮我规划一个杭州两日游的行程',
    ask: '帮我规划一个杭州周末两日游的行程',
  },
  {
    icon: '🏖️',
    title: '穿衣建议',
    desc: '去厦门前想了解天气和穿着建议',
    ask: '去厦门前想了解天气，顺便给我一些穿着和出行建议',
  },
];
