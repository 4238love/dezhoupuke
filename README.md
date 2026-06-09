# 德州扑克现金桌 MVP

第一版目标：可部署的网页德州扑克现金桌，支持私人房间、可配置 AI 数量和难度、朋友联机、服务器权威牌局、Docker 单容器部署。

## 开发运行

```bash
npm install
npm run dev
```

开发服务默认由后端监听 `http://localhost:8080`，前端开发可单独运行 `npm run dev -w client`。

## 构建

```bash
npm run build
npm test
```

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

容器内监听 `8080`，本地 Compose 默认映射到 `http://localhost:18080`，避免和常见本机服务冲突。公网 HTTPS 和域名建议由外部 Nginx、Caddy 或云网关反向代理处理。

AI 默认使用本地规则，不需要 API。若要使用 OpenAI-compatible AI API，编辑 `.env` 中的 `POKER_AI_ENGINE=api`、`POKER_AI_API_BASE_URL`、`POKER_AI_API_KEY`、`POKER_AI_API_MODEL`。

如果服务器或本机需要代理拉取基础镜像，可以临时设置：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:10808"
$env:HTTP_PROXY ="http://127.0.0.1:10808"
docker compose up -d --build
```

## 文档

- 领域术语：`CONTEXT.md`
- MVP 规格：`docs/specs/mvp-requirements.md`
- PRD：`.scratch/texas-holdem-mvp/PRD.md`
- ADR：`docs/adr/`
- 架构说明：`docs/architecture.md`
- 部署指南：`docs/deployment.md`
