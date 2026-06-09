export type PokerAiEngine = "rule" | "api";

export interface AiApiConfig {
  engine: PokerAiEngine;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface PublicAiConfig {
  engine: PokerAiEngine;
  baseUrlConfigured: boolean;
  model?: string;
  apiKeyConfigured: boolean;
  timeoutMs: number;
}

export interface ServerConfig {
  ai: AiApiConfig;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const engine = normalizeAiEngine(env.POKER_AI_ENGINE);
  return {
    ai: {
      engine,
      baseUrl: normalizeApiBaseUrl(env.POKER_AI_API_BASE_URL),
      model: optionalString(env.POKER_AI_API_MODEL),
      apiKey: optionalString(env.POKER_AI_API_KEY),
      timeoutMs: normalizePositiveInteger(env.POKER_AI_API_TIMEOUT_MS, 3500),
    },
  };
}

export function publicAiConfig(config: AiApiConfig): PublicAiConfig {
  return {
    engine: config.engine,
    baseUrlConfigured: Boolean(config.baseUrl),
    model: config.model,
    apiKeyConfigured: Boolean(config.apiKey),
    timeoutMs: config.timeoutMs,
  };
}

export function aiApiReady(config: AiApiConfig): boolean {
  return config.engine === "api" && Boolean(config.baseUrl && config.model && config.apiKey);
}

function normalizeAiEngine(value: string | undefined): PokerAiEngine {
  return value === "api" ? "api" : "rule";
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeApiBaseUrl(value: string | undefined): string | undefined {
  const trimmed = optionalString(value)?.replace(/\/+$/, "");
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/v1";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
