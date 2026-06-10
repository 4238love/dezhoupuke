import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiApiReady, publicAiConfig, readServerConfig } from "../src/config.js";

describe("AI API configuration", () => {
  it("defaults to built-in rule AI without requiring an API key", () => {
    const config = readServerConfig({});

    assert.equal(config.ai.engine, "rule");
    assert.equal(aiApiReady(config.ai), false);
  });

  it("reports API readiness without exposing the API key", () => {
    const config = readServerConfig({
      POKER_AI_ENGINE: "api",
      POKER_AI_API_BASE_URL: "https://ai.example.test/v1",
      POKER_AI_API_KEY: "secret-key",
      POKER_AI_API_MODEL: "poker-model",
      POKER_AI_API_TIMEOUT_MS: "2000",
    });

    assert.equal(aiApiReady(config.ai), true);
    assert.equal(config.ai.baseUrl, "https://ai.example.test/v1");
    assert.deepEqual(publicAiConfig(config.ai), {
      engine: "api",
      baseUrlConfigured: true,
      model: "poker-model",
      apiKeyConfigured: true,
      timeoutMs: 2000,
    });
  });

  it("normalizes a provider root URL to the OpenAI-compatible /v1 base", () => {
    const config = readServerConfig({
      POKER_AI_ENGINE: "api",
      POKER_AI_API_BASE_URL: "https://ai.example.test/",
      POKER_AI_API_KEY: "secret-key",
      POKER_AI_API_MODEL: "poker-model",
    });

    assert.equal(config.ai.baseUrl, "https://ai.example.test/v1");
  });

  it("normalizes DeepSeek URLs to the current documented API root", () => {
    const config = readServerConfig({
      POKER_AI_ENGINE: "api",
      POKER_AI_API_BASE_URL: "https://api.deepseek.com/v1",
      POKER_AI_API_KEY: "secret-key",
      POKER_AI_API_MODEL: "deepseek-v4-pro",
    });

    assert.equal(config.ai.baseUrl, "https://api.deepseek.com");
  });
});
