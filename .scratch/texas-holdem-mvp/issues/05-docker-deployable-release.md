# Docker deployable release tracer

Status: ready-for-agent

## What to build

Package the web game into a single Docker application container and document local and server deployment for an Alibaba Cloud 2-core 2GB server.

## Acceptance criteria

- [ ] The app builds with one command.
- [ ] The Docker image builds successfully.
- [ ] The container serves the client, HTTP API, and WebSocket endpoint.
- [ ] Runtime configuration avoids hard-coded localhost.
- [ ] Deployment documentation covers local Docker run and external reverse proxy assumptions.

## Blocked by

- `04-ai-takeover-reconnect-removal.md`
