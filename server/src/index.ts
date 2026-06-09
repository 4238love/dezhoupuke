import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { chooseAiActionWithApi } from "./ai-api.js";
import { aiApiReady, publicAiConfig, readServerConfig } from "./config.js";
import { AiActionDecision, CreateRoomInput, GameService, PlayerActionInput } from "./game.js";

type ClientMessage =
  | { type: "createRoom"; payload: CreateRoomInput }
  | { type: "joinRoom"; payload: { roomCode: string; nickname: string; sessionId?: string } }
  | { type: "reconnect"; payload: { roomCode: string; playerId?: string; sessionId: string } }
  | { type: "action"; payload: Omit<PlayerActionInput, "roomCode" | "playerId"> }
  | { type: "leave" }
  | { type: "removePlayer"; payload: { targetPlayerId: string } }
  | { type: "endRoom" }
  | { type: "ping" };

interface ClientContext {
  ws: WebSocket;
  roomCode?: string;
  playerId?: string;
  sessionId?: string;
}

const port = Number(process.env.PORT ?? 8080);
const config = readServerConfig();
const game = new GameService();
const clients = new Set<ClientContext>();
const aiTimers = new Map<string, NodeJS.Timeout>();
const nextHandTimers = new Map<string, NodeJS.Timeout>();
const actionTimers = new Map<string, { key: string; timer: NodeJS.Timeout }>();
const aiRuntimeStats = {
  apiAttempts: 0,
  apiSuccesses: 0,
  apiFallbacks: 0,
  ruleDecisions: 0,
  lastDecisionSource: "none",
  lastDecisionAt: undefined as string | undefined,
  lastApiStatus: undefined as number | undefined,
  lastApiElapsedMs: undefined as number | undefined,
  lastApiError: undefined as string | undefined,
};

const server = createServer((request, response) => {
  void handleHttp(request, response);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const context: ClientContext = { ws };
  clients.add(context);

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      handleClientMessage(context, message);
    } catch (error) {
      send(context, { type: "error", message: error instanceof Error ? error.message : "未知错误" });
    }
  });

  ws.on("close", () => {
    clients.delete(context);
    if (context.roomCode && context.playerId) {
      game.markDisconnected(context.roomCode, context.playerId);
      broadcastRoom(context.roomCode);
    }
  });
});

setInterval(() => {
  const expired = game.expireStale();
  for (const roomCode of expired) {
    for (const client of clients) {
      if (client.roomCode === roomCode) {
        send(client, { type: "roomExpired" });
        client.roomCode = undefined;
        client.playerId = undefined;
      }
    }
  }
}, 30_000).unref();

server.listen(port, "0.0.0.0", () => {
  console.log(`Texas Hold'em server listening on http://0.0.0.0:${port}`);
});

function handleClientMessage(context: ClientContext, message: ClientMessage): void {
  if (message.type === "ping") {
    send(context, { type: "pong" });
    return;
  }

  if (message.type === "createRoom") {
    const result = game.createRoom(message.payload);
    bindContext(context, result.roomCode, result.playerId, result.sessionId);
    send(context, { type: "session", roomCode: result.roomCode, playerId: result.playerId, sessionId: result.sessionId });
    broadcastRoom(result.roomCode);
    scheduleRoomWork(result.roomCode);
    return;
  }

  if (message.type === "joinRoom") {
    const result = game.joinRoom(message.payload);
    bindContext(context, result.roomCode, result.playerId, result.sessionId);
    send(context, { type: "session", roomCode: result.roomCode, playerId: result.playerId, sessionId: result.sessionId });
    broadcastRoom(result.roomCode);
    scheduleRoomWork(result.roomCode);
    return;
  }

  if (message.type === "reconnect") {
    const result = game.reconnect(message.payload.roomCode, message.payload.playerId, message.payload.sessionId);
    bindContext(context, message.payload.roomCode, result.playerId, message.payload.sessionId);
    send(context, { type: "session", roomCode: message.payload.roomCode, playerId: result.playerId, sessionId: message.payload.sessionId });
    broadcastRoom(message.payload.roomCode);
    scheduleRoomWork(message.payload.roomCode);
    return;
  }

  if (!context.roomCode || !context.playerId) {
    throw new Error("还未加入房间");
  }

  if (message.type === "action") {
    game.applyAction({ ...message.payload, roomCode: context.roomCode, playerId: context.playerId });
    broadcastRoom(context.roomCode);
    scheduleRoomWork(context.roomCode);
    return;
  }

  if (message.type === "leave") {
    game.leaveSeat(context.roomCode, context.playerId);
    broadcastRoom(context.roomCode);
    scheduleRoomWork(context.roomCode);
    return;
  }

  if (message.type === "removePlayer") {
    game.removePlayer(context.roomCode, context.playerId, message.payload.targetPlayerId);
    broadcastRoom(context.roomCode);
    scheduleRoomWork(context.roomCode);
    return;
  }

  if (message.type === "endRoom") {
    const roomCode = context.roomCode;
    game.endRoom(roomCode, context.playerId);
    for (const client of clients) {
      if (client.roomCode === roomCode) {
        send(client, { type: "roomExpired" });
        client.roomCode = undefined;
        client.playerId = undefined;
      }
    }
  }
}

function bindContext(context: ClientContext, roomCode: string, playerId: string, sessionId: string): void {
  context.roomCode = roomCode;
  context.playerId = playerId;
  context.sessionId = sessionId;
}

function broadcastRoom(roomCode: string): void {
  for (const client of clients) {
    if (client.roomCode === roomCode && client.ws.readyState === WebSocket.OPEN) {
      send(client, { type: "snapshot", snapshot: game.snapshot(roomCode, client.playerId) });
    }
  }
}

function scheduleRoomWork(roomCode: string): void {
  const roomView = game.snapshot(roomCode);
  const currentSeatIndex = roomView.hand?.currentTurnSeatIndex;
  const currentSeat = currentSeatIndex === undefined ? undefined : roomView.seats[currentSeatIndex];
  const currentKey =
    roomView.hand && currentSeatIndex !== undefined
      ? `${roomView.hand.id}:${currentSeatIndex}:${roomView.hand.currentBet}:${currentSeat?.roundBet ?? 0}`
      : "";

  if (roomView.hand?.phase === "settled") {
    clearActionTimer(roomCode);
    if (!nextHandTimers.has(roomCode)) {
      const timer = setTimeout(() => {
        nextHandTimers.delete(roomCode);
        game.startNextHand(roomCode);
        broadcastRoom(roomCode);
        scheduleRoomWork(roomCode);
      }, 4500);
      nextHandTimers.set(roomCode, timer);
    }
    return;
  }

  if (currentSeat?.occupant?.kind === "human") {
    const existing = actionTimers.get(roomCode);
    if (existing?.key !== currentKey) {
      clearActionTimer(roomCode);
      const timer = setTimeout(() => {
        actionTimers.delete(roomCode);
        try {
          game.timeoutCurrentAction(roomCode);
          broadcastRoom(roomCode);
          scheduleRoomWork(roomCode);
        } catch (error) {
          console.error("Action timeout failed", error);
        }
      }, 120_000);
      actionTimers.set(roomCode, { key: currentKey, timer });
    }
    return;
  }

  clearActionTimer(roomCode);
  if (currentSeat?.occupant?.kind !== "ai" || aiTimers.has(roomCode)) {
    return;
  }

  const delay = 500 + Math.floor(Math.random() * 1000);
  const timer = setTimeout(() => {
    aiTimers.delete(roomCode);
    void performScheduledAiAction(roomCode);
  }, delay);
  aiTimers.set(roomCode, timer);
}

async function performScheduledAiAction(roomCode: string): Promise<void> {
  try {
    const context = game.currentAiDecisionContext(roomCode);
    let decision: AiActionDecision | undefined;
    let source = "rule";

    if (context && aiApiReady(config.ai)) {
      const result = await chooseAiActionWithApi(context, config.ai);
      if (result.attempted) {
        aiRuntimeStats.apiAttempts += 1;
        aiRuntimeStats.lastApiStatus = result.status;
        aiRuntimeStats.lastApiElapsedMs = result.elapsedMs;
        aiRuntimeStats.lastApiError = result.error;
      }
      if (result.ok && result.decision) {
        decision = result.decision;
        source = "api";
        aiRuntimeStats.apiSuccesses += 1;
      } else {
        source = "api-fallback";
        aiRuntimeStats.apiFallbacks += 1;
      }
    }

    if (!decision) {
      aiRuntimeStats.ruleDecisions += 1;
    }

    if (game.performAiAction(roomCode, decision)) {
      aiRuntimeStats.lastDecisionSource = source;
      aiRuntimeStats.lastDecisionAt = new Date().toISOString();
      console.log(
        `AI decision room=${roomCode} source=${source} apiAttempts=${aiRuntimeStats.apiAttempts} apiSuccesses=${aiRuntimeStats.apiSuccesses} apiFallbacks=${aiRuntimeStats.apiFallbacks}`,
      );
      broadcastRoom(roomCode);
      scheduleRoomWork(roomCode);
    }
  } catch (error) {
    console.error("AI action failed", error);
    aiRuntimeStats.apiFallbacks += config.ai.engine === "api" ? 1 : 0;
    aiRuntimeStats.ruleDecisions += 1;
    if (game.performAiAction(roomCode)) {
      aiRuntimeStats.lastDecisionSource = "error-fallback";
      aiRuntimeStats.lastDecisionAt = new Date().toISOString();
      broadcastRoom(roomCode);
      scheduleRoomWork(roomCode);
    }
  }
}

function clearActionTimer(roomCode: string): void {
  const existing = actionTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing.timer);
    actionTimers.delete(roomCode);
  }
}

function send(context: ClientContext, payload: unknown): void {
  if (context.ws.readyState === WebSocket.OPEN) {
    context.ws.send(JSON.stringify(payload));
  }
}

async function handleHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/api/health") {
    respondJson(response, 200, { ok: true, rooms: game.listRoomCodes().length, ai: { ...publicAiConfig(config.ai), runtime: aiRuntimeStats } });
    return;
  }

  const clientDist = process.env.CLIENT_DIST_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  let filePath = path.join(clientDist, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(clientDist)) {
    respondText(response, 403, "Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    filePath = path.join(clientDist, "index.html");
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(content);
  } catch {
    respondText(response, 200, fallbackHtml());
  }
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function respondText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function fallbackHtml(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>德州扑克</title></head><body><h1>德州扑克服务已启动</h1><p>请先构建 client，或使用 Docker 镜像访问完整前端。</p></body></html>`;
}
