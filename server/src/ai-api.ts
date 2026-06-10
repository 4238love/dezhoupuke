import { aiApiReady } from "./config.js";
import type { AiApiConfig } from "./config.js";
import type { AiActionDecision, AiDecisionContext, PlayerActionType } from "./game.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface AiApiDecisionResult {
  attempted: boolean;
  ok: boolean;
  decision?: AiActionDecision;
  status?: number;
  elapsedMs: number;
  error?: string;
}

export async function chooseAiActionWithApi(
  context: AiDecisionContext | undefined,
  config: AiApiConfig,
): Promise<AiApiDecisionResult> {
  const started = Date.now();
  if (!context || !aiApiReady(config)) {
    return { attempted: false, ok: false, elapsedMs: 0, error: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl!.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 160,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content:
              "You are a Texas Hold'em AI. Do not reason. Return only compact JSON: {\"type\":\"fold|check|call|bet|raise|all-in\",\"amount\":number}. Never include markdown.",
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction: "Choose exactly one legal action. For bet/raise, amount is the final bet size required by the legal action.",
              table: context,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        status: response.status,
        elapsedMs: Date.now() - started,
        error: `http_${response.status}`,
      };
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const decision = parseAiDecision(payload.choices?.[0]?.message?.content);
    return {
      attempted: true,
      ok: Boolean(decision),
      decision,
      status: response.status,
      elapsedMs: Date.now() - started,
      error: decision ? undefined : "invalid_response",
    };
  } catch {
    return {
      attempted: true,
      ok: false,
      elapsedMs: Date.now() - started,
      error: "request_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseAiDecision(content: string | undefined): AiActionDecision | undefined {
  if (!content) {
    return undefined;
  }
  const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  try {
    const parsed = JSON.parse(jsonText) as { type?: unknown; amount?: unknown };
    if (!isAiActionType(parsed.type)) {
      return undefined;
    }
    return {
      type: parsed.type,
      amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
    };
  } catch {
    return undefined;
  }
}

function isAiActionType(value: unknown): value is PlayerActionType {
  return value === "fold" || value === "check" || value === "call" || value === "bet" || value === "raise" || value === "all-in";
}
