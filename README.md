# TravelAgent Web · 旅行智能体前端

根据 [AgentDemo](https://github.com/placeholder/AgentDemo)（Spring Boot WebFlux + Spring AI，Qwen + Tavily 天气/景点工具）的 SSE 协议实现的对话前端。UI 参考 Manus 风格：墨色侧栏 + 浅色画布 + 紫粉渐变光球。

## 后端接口约定（SSE）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat` | 流式对话，`text/event-stream`，每行 `data:{"eventType":1001,"eventData":"文本增量"}`；1002=结束、1004=错误 |
| POST | `/api/chat/sync` | 阻塞式对话，返回 `{"answer": "..."}` |
| POST | `/api/chat/stop?sessionId=` | 停止生成 |
| GET/DELETE | `/api/chat/history?sessionId=` | 读/清会话记忆 |

前端以浏览器原生 `fetch` + `ReadableStream` 解析 SSE（`EventSource` 不支持 POST，故未使用）。

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
3. **直连**：在界面右上角「设置」里把 Base URL 填成后端地址，并把运行模式切到「直连后端」。跨域直连需要后端开启 CORS（当前 AgentDemo 未配置 CORS，建议用方式 1/2）。

## 运行模式

- **演示模式（默认兜底）**：本地模拟智能体，不请求后端。会展示 `getWeather → getAttraction → 汇总` 的工具调用步骤与流式打字机效果，内置北京/上海/杭州/成都/广州/深圳/西安/厦门/重庆/三亚等城市示例数据，开箱即用。
- **直连后端**：对接真实 AgentDemo。工具调用由后端框架自动完成，前端仅展示文本增量；期间以「智能体运行中」状态动画过渡。
- **首启自动识别（v1.0.1+）**：浏览器从未保存过设置时，首次打开会探测一次后端（同源 `/api/chat/history`，开发环境经 Vite 代理到 18080）。后端可达 → 自动切到「直连后端」；不可达 → 保持演示模式。已保存过设置的用户不受影响，可在「设置」里手动切换并保存。

## 目录结构

```
src/
  App.tsx               # 全局状态与 SSE/Mock 编排
  types.ts              # 消息/会话/事件类型（对齐 ChatEventTypeEnum）
  lib/
    api.ts              # SSE fetch 流解析、stop/history 调用
    mock.ts             # 演示模式模拟 Agent
    markdown.tsx        # 轻量 Markdown 渲染（无第三方依赖）
    storage.ts          # localStorage 多会话持久化
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
