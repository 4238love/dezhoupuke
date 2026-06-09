# Deployment Guide

## Local Docker deployment

The application is packaged as one container. The container listens on `8080`; `docker-compose.yml` maps it to local host port `18080`.

Copy the environment template before first deployment:

```powershell
Copy-Item .env.example .env
```

```powershell
docker compose up -d --build
```

Open:

```text
http://localhost:18080
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18080/api/health"
```

WebSocket smoke test:

```powershell
npm run smoke:ws
```

## AI API configuration

The default AI is the built-in local poker AI and does not require any external API.

To use an OpenAI-compatible Chat Completions API for AI actions, edit `.env`:

```env
POKER_AI_ENGINE=api
POKER_AI_API_BASE_URL=https://your-ai-provider.example/v1
POKER_AI_API_KEY=replace-with-your-key
POKER_AI_API_MODEL=your-model-name
POKER_AI_API_TIMEOUT_MS=3500
```

Notes:

- Keep real API keys in `.env`; `.env` is ignored by git.
- `.env.example` is safe to commit and only contains placeholders.
- If API config is missing or the API call fails, the server falls back to the built-in local poker AI.
- Health check shows whether AI API settings are present without exposing the API key:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18080/api/health"
```

To confirm the AI actually used the API, create a room with one human and one AI, take an action so it becomes the AI's turn, then check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18080/api/health" | ConvertTo-Json -Depth 8
```

Look at `ai.runtime`:

- `apiAttempts > 0`: the server attempted to call the configured AI API.
- `apiSuccesses > 0`: at least one AI decision came from the API.
- `apiFallbacks > 0`: an API attempt failed or returned an invalid decision, so the server used local rule AI.
- `lastDecisionSource = "api"`: the most recent AI decision used the API.
- `lastDecisionSource = "api-fallback"`: the most recent AI decision fell back to local rule AI.

Container logs also include AI decision source:

```powershell
docker compose logs app --tail=80
```

## Proxy environment

If Docker needs a proxy to pull the Node base image:

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:10808"
$env:HTTP_PROXY ="http://127.0.0.1:10808"
docker compose up -d --build
```

## Alibaba Cloud 2-core 2GB deployment

Recommended first deployment:

1. Install Docker and Docker Compose plugin.
2. Copy the project to the server.
3. Run `docker compose up -d --build`.
4. Open the security group for the chosen public port.
5. Point a domain to the server if needed.
6. Put Nginx, Caddy, or an Alibaba Cloud gateway in front for HTTPS.

## Reverse proxy notes

The app uses same-origin WebSocket at `/ws`. A reverse proxy must forward WebSocket upgrade headers.

Example Nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:18080;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Capacity target

The MVP is designed for:

- one server;
- up to 10 active Private Rooms;
- up to 50 concurrently online human players;
- up to 9 Seats per Private Room.

If capacity is exceeded, new room creation returns a server-busy error.
