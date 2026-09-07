# 前端优化报告：依据后端代码对齐 AgentWebDemo

> 日期：2026-09-07
> 对照后端：`AgentDemo/agentDemo1_0`（Spring Boot WebFlux + Spring AI）
> 涉及前端：`AgentWebDemo`（React + Vite，SSE 直连/演示双模式）
> 结论：前端 SSE 协议与后端 **ChatEventTypeEnum / AgentRunner / ChatController** 已基本一致，本次聚焦「直连后端场景下的体验与健壮性」差异做了 4 处修改，另附 1 份对照清单说明已核对无需改动的部分。

---

## 一、改动总览

| # | 文件 | 改动 | 后端依据 / 问题背景 |
|---|------|------|--------------------|
| 1 | `src/lib/api.ts` | 新增 `probeBackend()`：真实请求 `GET /api/chat/history`，带 3s 超时，返回 `{ok, status, message}` 区分「可达 / HTTP 报错 / 不可达」 | 原 `fetchRemoteHistory()` 内部 `catch` 吞掉网络错误并返回 `[]`，无法区分「后端未启动」与「历史为空」 |
| 2 | `src/components/SettingsSheet.tsx` | 「检测后端连通性」改用 `probeBackend()`，失败时给出真实原因与代理提示 | 修复假阳性：此前后端没启动也显示「连接成功」 |
| 3 | `src/lib/storage.ts` | 新增 `hasSavedSettings()`：判断用户是否保存过设置 | 为「首启自动识别」提供依据，避免覆盖用户显式选择 |
| 4 | `src/App.tsx` | ① 首次启动自动探测后端，可达则自动切到「直连后端」并 toast 提示；② `SESSION_INFO(1010)` 处理增加空值防护 | ① 前端 README 推荐用法就是直连后端（后端 `application.yml` 端口 18080），此前默认停在演示模式，后端在跑也看不到真实日志；② 防御跨端异常把 `eventData` 传成 `null` 时 `setSessionInfo` 直接访问字段导致崩溃 |

---

## 二、逐项说明

### 1. 后端连通性探测（api.ts → probeBackend）

- **为什么不能用 `fetchRemoteHistory` 探测**：它把一切异常吞掉并返回 `[]`（历史为空也是 `[]`），所以“后端没启动”会被误报为“连接成功、0 条记录”。
- **新函数行为**：
  - 请求 `GET /api/chat/history?sessionId=probe-<ts>`（GET 只读，不会在后端创建会话记忆）；
  - `AbortController` + 3s 超时兜底，防止后端不可达时按钮长时间转圈；
  - 返回三态结果：`ok=true`（HTTP 2xx）/ `ok=false, status>0`（后端在但报错）/ `ok=false, status=0`（网络不可达或超时，并区分同源代理与直连两种提示文案）。

### 2. 设置页连通性检测（SettingsSheet.tsx）

- 按钮逻辑从 `fetchRemoteHistory` 改为 `probeBackend`，并把后端返回/错误信息直接呈现：
  - 成功：`后端可达，历史接口正常`；
  - 失败：`无法连接（当前请求经 Vite 代理 /api → 后端 18080）` 或 `无法连接：请确认后端已启动且地址无误`。
- 移除了不再使用的 `fetchRemoteHistory` import。

### 3. 首启自动识别后端（storage.ts + App.tsx）

- **触发条件**（三者同时满足）：从未保存过设置（`hasSavedSettings() === false`）、当前仍是演示模式、同源探测 `probeBackend('', 2500)` 成功。
- **效果**：新用户打开页面、后端已启动时，自动切到「直连后端」并 toast 提示，前端立刻走真实 SSE 链路（思考/工具卡片/用量均来自后端直播事件），无需手动到设置里切换。
- **兜底**：后端未启动 → 静默保持演示模式；用户已保存过 `demoMode` → 尊重用户选择，绝不自动改写；`bootProbeRef` 防止 React StrictMode 下重复探测。

### 4. SESSION_INFO 空值防护（App.tsx）

- 事件分发处 `setSessionInfo(e.eventData as SessionInfoData)` 原实现直接 `d.conversationId`——若跨端异常把 `eventData` 传成 `null` 会在 setState 内抛 TypeError。
- 现在 `setSessionInfo(d: SessionInfoData | null)` 先判空再访问；与 `REASONING / TOOL_CALL_* / USAGE` 分支的既有判空风格一致。

---

## 三、已核对、与后端契约一致无需改动的部分

| 协议点 | 前端实现 | 后端出处 |
|--------|----------|----------|
| 事件编号 1001~1010 | `src/types.ts` `EVENT` 常量镜像 | `enums/ChatEventTypeEnum.java` |
| SSE 请求方式 `POST /api/chat`（fetch + ReadableStream，逐行解析 `data:`，容忍 `\r\n`/半行/注释行/单帧坏 JSON） | `api.ts streamChat` | `ChatController.chat`（`text/event-stream`） |
| 会话键：前端 UUID 作 `sessionId`，后端自动规范为 `chat-<id>`；留空风险已知 | `App.tsx send()` 每次新会话生成 UUID | `support/ConversationKeys.java` |
| 停止生成：先 `POST /api/chat/stop`，等流内 1002 自然收尾，4s 兜底本地 abort | `App.tsx requestStop()` + `api.ts stopGeneration` | `ChatController.stop` + `ChatServiceImpl.chat`（takeWhile 截流后仍补 STOP） |
| 事件顺序不变量：SESSION_INFO 首帧 / 思考后工具卡片 / 失败兜底 DATA / USAGE 在 STOP 前 | 全量事件分发 `App.onLiveEvent`，按事件类型增量渲染 | `AgentRunner#stream` / `AgentRunnerTest` |
| `REASONING(1007)` 剥离「思考：」前缀、不进最终答案 | 独立「思考过程」折叠块，1.6s 后自动收起 | `AgentRunner.ReasoningSplitter` |
| 工具卡生命周期 STARTED→RESULT/FAILED；`arguments` 可能是截断脏 JSON，不做硬 `JSON.parse` | `LiveBlocks.ToolCard` + `updateToolBy` 按最近 running 同名匹配 | `AgentRunner#executeTool`（500 字截断 result） |
| 历史恢复 `我: / 助手:` 前缀解析、清空上下文联动 `DELETE /api/chat/history` | `parseHistoryLine` / `fetchRemoteHistory` / `clearRemoteHistory` | `ChatServiceImpl#history/clear`、`ChatController` |
| 同步接口 `/api/chat/sync` 仅作 demo 保留，主路径走 SSE | 前端未调用（符合后端注释） | `ChatController.chatSync` |
| 错误语义：ERROR(1004) 与 STOP(1002) 均终结；HTTP 非 2xx 先行拦截 | `streamChat` 返回 `{kind:'error'}` 与事件分流 | `ChatServiceImpl` onErrorResume |

---

## 四、验证

- `npm run typecheck`：通过（无类型错误）。
- `npm run build`：通过（`tsc -b && vite build`，产物 `dist/`：index.html + css 25.25kB + js 181.85kB）。
- 建议手工联调验证：
  1. 启动后端（端口 18080）→ `npm run dev` → 打开 `http://localhost:5173`，首次访问应 toast「检测到后端服务，已自动切到直连后端」，提问后 Java 控制台出现 `[chat]`/`[agent]` 日志；
  2. 停掉后端 → 清掉 localStorage 中 `travel-agent.settings.v1` 后刷新 → 应停留在演示模式；
  3. 设置页「检测后端连通性」在后端关闭时应提示失败原因（而非“连接成功”）。
