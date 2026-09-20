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
旧版接口恢复代码仍保留为兼容性降级，但当前 UI 不会主动触发这些不存在的端点。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173 （/api 已代理到 http://localhost:18080）
```

修改代理目标：

```bash
VITE_PROXY_TARGET=http://localhost:8080 npm run dev
```

## 构建与部署

```bash
npm run build      # 产物在 dist/
```

三种接入方式：

1. **开发联调**：跑 `vite dev`，`/api` 自动代理到 Java 后端，前后端不同端口也不会有 CORS 问题；
2. **同源部署（推荐）**：把 `dist/` 内容拷贝到后端 `src/main/resources/static/`，重启 Spring Boot 后直接访问 `http://localhost:18080/`；
3. **直连**：在界面右上角「设置」里把 Base URL 填成后端地址，并把运行模式切到「直连后端」。当前后端已允许 localhost / 127.0.0.1 的跨源请求。

## 运行模式

- **演示模式（默认兜底）**：本地模拟智能体，不请求后端。会展示 `getWeather → getAttraction → 汇总` 的工具调用步骤与流式打字机效果，内置北京/上海/杭州/成都/广州/深圳/西安/厦门/重庆/三亚等城市示例数据，开箱即用。
- **直连后端**：对接真实 AgentDemo。工具调用由后端框架自动完成，前端仅展示文本增量；期间以「智能体运行中」状态动画过渡。
- **首启自动识别**：浏览器从未保存过设置时，首次打开会探测一次 `GET /api/chat`。当前后端返回 405 即代表路由已就绪，前端会自动切到「直连后端」；不可达则保持演示模式。已保存过设置的用户不受影响，可在「设置」里手动切换并保存。

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
    api.ts              # SSE fetch 流解析（含 60s 空闲超时兜底）、stop/history、分页恢复
    mock.ts             # 演示模式模拟 Agent
    markdown.tsx        # 轻量 Markdown 渲染（无第三方依赖）
    remote.ts           # 后端结构化消息 → 前端消息（含摘要卡）的纯映射
    storage.ts          # localStorage 多会话持久化（会话/当前会话/设置）
    format.ts           # 相对时间/时钟格式化
  components/
    Sidebar.tsx         # 会话列表（墨色）
    ChatArea.tsx        # 主聊界面
    MessageItem.tsx     # 消息气泡 + 步骤/状态
    Thinking.tsx        # 步骤面板 + 思考动画
    Composer.tsx        # 输入框（Enter 发送/IME 安全）
    SettingsSheet.tsx   # 运行模式与连接设置
    EmptyState.tsx      # 空状态 + 建议卡片
    Avatar.tsx          # 品牌光球
```
