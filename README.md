# AgentWebDemo

`AgentWebDemo` 是 AgentDemo 的 React/Vite 前端。生产环境由 Nginx 提供构建产物，并把同源 `/api/` 请求转发给 Spring Boot 后端。

## 开发

```bash
npm ci
npm run typecheck
npm run dev
```

Vite 开发服务器把 `/api` 代理到 `http://localhost:18080`。浏览器端仍使用同源路径，因此登录 Cookie 和 SSE 请求在开发、生产环境保持一致。

## 构建

```bash
npm run build
```

构建产物位于 `dist/`。部署时将 `dist/` 的内容复制到 Nginx 的网站根目录。

## 后端接口

前端使用 AgentDemo 提供的同源 API：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 服务健康检查 |
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/auth/me` | 获取当前登录用户 |
| `POST` | `/api/chat` | SSE 流式对话 |
| `POST` | `/api/image-assets/upload-policy` | 获取 OSS 直传策略 |
| `POST` | `/api/image-assets/{assetId}/complete` | 确认图片上传 |
| `GET` | `/api/image-jobs/*` | 查询图片任务 |
| `GET/POST/PATCH/DELETE` | `/api/bobo/*` | Bobo World 作品操作 |
| `GET/PUT/DELETE` | `/api/settings/keys` | 用户模型密钥管理 |

聊天接口返回 `text/event-stream`。Nginx 必须关闭 `/api/` 的响应缓冲，否则浏览器会等到整段响应结束才显示内容。

## 生产部署

1. 执行 `npm run build`。
2. 将 `dist/` 内容复制到 `/var/www/AgentWebDemo/`。
3. Nginx 使用 `/var/www/AgentWebDemo` 作为 `root`。
4. Nginx 将 `/api/` 代理到 `http://127.0.0.1:18080`。

前端默认使用空的 `baseUrl`，因此生产环境不需要配置公网后端地址，也不会把 `localhost:18080` 打包进浏览器请求。
