import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";
import { chooseAiActionWithApi } from "../src/ai-api.js";
import type { AiDecisionContext } from "../src/game.js";

describe("AI API chat completions", () => {
  const requests: Array<{ url?: string; authorization?: string; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "{\"type\":\"check\"}" } }] }));
    });
  });

  after(() => {
    server.close();
  });

  it("posts an OpenAI-compatible request with JSON output enabled", async () => {
    requests.length = 0;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const result = await chooseAiActionWithApi(sampleContext(), {
      engine: "api",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: "secret-key",
      model: "test-model",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v1/chat/completions");
    assert.equal(requests[0].authorization, "Bearer secret-key");

    const body = JSON.parse(requests[0].body) as {
      model?: string;
      response_format?: { type?: string };
      thinking?: { type?: string };
    };
    assert.equal(body.model, "test-model");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { type: "disabled" });
  });
});

function sampleContext(): AiDecisionContext {
  return {
    roomCode: "TEST01",
    aiDifficulty: "standard",
    phase: "preflop",
    pot: 15,
    currentBet: 10,
    minRaise: 10,
    toCall: 0,
    seatIndex: 1,
    nickname: "AI-1",
    chips: 990,
    roundBet: 10,
    contribution: 10,
    holeCards: [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
    ],
    communityCards: [],
    legalActions: [{ type: "check" }, { type: "bet", minAmount: 10 }, { type: "all-in" }],
  };
}
