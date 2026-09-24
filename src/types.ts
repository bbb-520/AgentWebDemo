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
  /** 图片后台任务：eventData 为 ImageJobEventData */
  IMAGE_JOB: 1011,
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

export type ImageJobStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'EXPIRED';

export interface ImageAttachment {
  assetId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** 当前浏览器会话中用于立即展示用户图片的本地对象地址。 */
  previewUrl?: string;
}

export interface ImageJobEventData {
  jobId: string;
  status: ImageJobStatus;
  mode?: string;
  createdAt?: string;
}

export interface ImageJobRef {
  jobId: string;
  status: ImageJobStatus;
  mode?: string;
  prompt?: string;
  createdAt?: string;
  completedAt?: string | null;
  imageUrl?: string | null;
  rationale?: string | null;
  error?: string | null;
}

export type Role = 'user' | 'assistant' | 'system';

export type MsgStatus = 'streaming' | 'done' | 'stopped' | 'error';

/** 会话历史摘要卡片的元信息（对齐后端摘要消息 metadata，见 FRONTEND-REQUIREMENTS-会话记忆优化.md §4） */
export interface SummaryMeta {
  /** 该摘要覆盖的原始消息条数 */
  summarizedCount?: number;
  /** 覆盖时间范围起点（ISO-8601 UTC） */
  rangeStart?: string;
  /** 覆盖时间范围终点（ISO-8601 UTC） */
  rangeEnd?: string;
}

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
  /** 兼容旧历史的思考过程字段；产品界面不会展示。 */
  thinking?: string[];
  /** 工具调用卡片列表（1005/1006/1008 驱动） */
  toolCalls?: ToolCallItem[];
  /** Token 用量（1009，可选；缺失时 UI 隐藏） */
  usage?: UsageData | null;
  /** 后端会话键（1010 SESSION_INFO 提供） */
  conversationId?: string;
  /** 本轮结束原因（收尾语义，文档 §6.2 endReason） */
  endReason?: EndReason;
  /** 摘要卡专属：role='system' 时携带压缩摘要的覆盖范围信息（恢复自后端 metadata） */
  summaryMeta?: SummaryMeta | null;
  createdAt: number;
  /** 助手消息：开始生成的时间戳 */
  startedAt?: number;
  /** 助手消息：生成结束（完成/停止/出错）的时间戳 */
  finishedAt?: number;
  /** 后端 Redis 历史序号（用于兼容旧历史）。 */
  seq?: number;
  /** 用户上传图片的元数据，不保存二进制或 data URL。 */
  attachments?: ImageAttachment[];
  /** 后台图片任务，仅保存任务 ID 和状态。 */
  imageJobs?: ImageJobRef[];
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
  theme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  // 开发时走 Vite /api 代理，浏览器看到的是同源请求，HttpOnly 登录 Cookie
  // 刷新后可以稳定回传；生产时由 Spring Boot 同源托管静态页。
  baseUrl: '',
  theme: 'light',
};

/* ---------- 后端会话记忆结构化消息（对齐 MessageWithConversation / PageResult） ----------
 * 对应接口：
 *   GET  /api/chat/{sessionId}/messages          分页查询（Redis，恢复历史用）
 *   GET  /api/chat/{sessionId}/messages/all      全量消息（Redis，含摘要）
 *   POST /api/chat/{sessionId}/summarize         手动触发压缩
 */

/** 后端消息类型（MessageWithConversation 的字符串 messageType） */
export type RemoteMsgType = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

/** 摘要消息 metadata 键（后端常量） */
export const REMOTE_META = {
  SUMMARY: 'summary',
  SUMMARIZED_COUNT: 'summarizedCount',
  RANGE_START: 'rangeStart',
  RANGE_END: 'rangeEnd',
} as const;

/** 一条后端会话消息（分页 records / messages/all 的数组元素，结构一致） */
export interface RemoteMessage {
  /** 内部会话键，形如 chat-xxx */
  conversationId: string;
  messageType: RemoteMsgType;
  /** 消息文本；摘要消息为 SystemMessage 原文（带「以下是此前对话的摘要：」前缀） */
  content: string;
  /** 普通消息为 null；摘要消息带 summary 标记与覆盖范围 */
  metadata: { [k: string]: unknown } | null;
  /** 消息时间戳（ISO-8601 UTC） */
  timestamp: string;
  /** epoch 毫秒副本（NUMERIC 索引字段；后端 Redis 8 结构已带，旧数据缺省为 undefined） */
  tsEpochMs?: number;
  /** 会话内自增序号（从 1 开始；搜索跳转/结果定位的地基，旧数据缺省为 undefined） */
  seq?: number;
}

/** 通用分页结构（对齐后端 PageResult<T>） */
export interface RemotePage<T> {
  records: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

/** POST /summarize 的响应体 */
export interface SummarizeResult {
  summarized: boolean;
  sessionId: string;
  /** summarized=true 时为摘要文本；false 时为空串 */
  summary: string;
}

export const SUGGESTIONS: { icon: string; title: string; desc: string; ask: string }[] = [
  {
    icon: '✦',
    title: '纸刊海报',
    desc: '把照片做成一张安静的复古纸刊海报',
    ask: '把这张照片做成一张安静的复古纸刊海报',
  },
  {
    icon: '◌',
    title: '换一层气氛',
    desc: '保留人物，把背景换成柔和的黄昏纸张',
    ask: '保留人物和姿态，把背景换成柔和的黄昏纸张',
  },
  {
    icon: '⌁',
    title: '提取情绪',
    desc: '不保留原图，只提取照片的情绪和色彩',
    ask: '不要保留原图，只提取这张照片的情绪和色彩重新创作',
  },
];
