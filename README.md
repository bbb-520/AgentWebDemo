# TravelAgent Web · 旅行智能体前端

根据 [AgentDemo](https://github.com/placeholder/AgentDemo)（Spring Boot WebFlux + Spring AI，Qwen + Tavily 天气/景点工具）的 SSE 协议实现的对话前端。UI 参考 Manus 风格：墨色侧栏 + 浅色画布 + 紫粉渐变光球。

## 后端接口约定（以 `AgentDemo/agentDemo1_0` 当前实现为准）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat` | 流式对话，`text/event-stream`，每行 `data:{"eventType":1001,"eventData":"文本增量"}`；1002=结束、1004=错误 |
| — | 其它 `/api/chat/**` | 当前后端未提供；前端不再展示搜索、总结等旧入口 |

前端以浏览器原生 `fetch` + `ReadableStream` 解析 SSE（`EventSource` 不支持 POST，故未使用）。

### 当前会话行为

- **会话标识（sessionId）即会话 id（uuid）**：每个会话只分配一次、localStorage 持久化、
  仅「新建对话」才更换；同会话同一时刻只允许一个在途请求（发送中禁用再次发送），
  封堵「重启后端后追问失忆」类问题（对齐 `FRONTEND_REQUIREMENTS.md` §1）。
- **刷新自动恢复**：记住上次选中的会话和本地消息；后端通过 `sessionId` + Redis 记忆维持多轮上下文。
- **会话归属**：每个本地会话只分配一个 UUID，原样传给 `ChatRequest.sessionId`；后端再结合匿名 Cookie 校验归属。
- **真实流事件**：当前后端保证 `SESSION_INFO → DATA × N → STOP`，异常时为 `ERROR → STOP`；工具调用由 Spring AI 内部编排，不对前端直播工具事件。
- **停止生成**：当前后端没有独立 `/stop` 接口，前端中断浏览器 SSE 流并保留已生成内容。
- **流空闲超时兜底**：SSE 超过 60s 未收到任何数据自动断连并解锁输入，避免连接挂起时界面永远停在生成中。
旧版接口恢复代码已移除，当前 UI 不会主动触发这些不存在的端点。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173（固定连接本地后端 http://localhost:18080）
```

## 构建与部署

```bash
npm run build      # 产物在 dist/
```

开发时运行 Vite，`/api` 自动代理到本地 Java 后端；也可以直接把构建产物放入后端静态目录。

## 运行模式

- **直连后端**：对接真实 AgentDemo。工具调用由后端框架自动完成，前端仅展示文本增量；期间以「智能体运行中」状态动画过渡。
- **本地后端地址固定**：前端始终请求 `http://localhost:18080`，无需配置环境变量或公网地址。

## 目录结构

```
src/
  main.tsx
  App.tsx               # 应用外壳：布局与 UI 局部状态（会话/设置/提示见 hooks/）
  types.ts              # 消息/会话/事件类型（对齐 ChatEventTypeEnum）
  hooks/
    useConversations.ts # 会话状态中枢：列表/选中/发送与 SSE 状态机/恢复/删除/清空/总结
    useSettings.ts      # 运行模式与后端地址（含首启自动识别后端）
    useToasts.ts        # 全局轻提示
  lib/
    api.ts              # SSE fetch 流解析（含 60s 空闲超时兜底）、图片与 Bobo World 接口
    markdown.tsx        # 轻量 Markdown 渲染（无第三方依赖）
    remote.ts           # 后端结构化消息 → 前端消息（含摘要卡）的纯映射
    storage.ts          # localStorage 多会话持久化（会话/当前会话/设置）
    format.ts           # 相对时间/时钟格式化
  components/
    Sidebar.tsx         # 会话列表（墨色）
    ChatArea.tsx        # 主聊界面
    MessageItem.tsx     # 消息气泡 + 状态
    Composer.tsx        # 输入框（Enter 发送/IME 安全）
    SettingsSheet.tsx   # 运行模式与连接设置
    EmptyState.tsx      # 空状态 + 建议卡片
    Avatar.tsx          # 品牌光球
```
