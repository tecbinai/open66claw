import { describe, it, expect } from "vitest";
import {
  buildVolcengineEmbeddingProvider,
  VOLCENGINE_EMBEDDING_PROVIDER_ID,
  VOLCENGINE_EMBEDDING_BASE_URL,
  VOLCENGINE_EMBEDDING_ENV_VAR,
  VOLCENGINE_EMBEDDING_MODELS,
} from "../embedding.js";

describe("buildVolcengineEmbeddingProvider", () => {
  const provider = buildVolcengineEmbeddingProvider();

  it("returns correct provider id", () => {
    expect(provider.id).toBe(VOLCENGINE_EMBEDDING_PROVIDER_ID);
    expect(provider.id).toBe("volcengine-embedding");
  });

  it("has label for Chinese users", () => {
    expect(provider.label).toContain("火山引擎");
    expect(provider.label).toContain("豆包");
  });

  it("declares VOLCENGINE_API_KEY env var", () => {
    expect(provider.envVars).toContain(VOLCENGINE_EMBEDDING_ENV_VAR);
  });

  it("uses volcengine base URL", () => {
    expect(provider.models?.baseUrl).toBe(VOLCENGINE_EMBEDDING_BASE_URL);
    expect(provider.models?.baseUrl).toContain("ark.cn-beijing.volces.com");
  });

  it("has embedding models only", () => {
    expect(provider.models?.models.length).toBeGreaterThanOrEqual(2);
    for (const model of provider.models?.models ?? []) {
      expect(model.id).toContain("embedding");
      expect(model.maxTokens).toBe(0);
    }
  });

  it("has api_key auth method", () => {
    expect(provider.auth).toHaveLength(1);
    expect(provider.auth[0].kind).toBe("api_key");
  });
});

describe("VOLCENGINE_EMBEDDING_MODELS", () => {
  it("every model has required fields", () => {
    for (const model of VOLCENGINE_EMBEDDING_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.reasoning).toBe("boolean");
      expect(model.reasoning).toBe(false);
      expect(model.input).toContain("text");
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.cost).toHaveProperty("input");
      expect(model.cost).toHaveProperty("output");
    }
  });

  it("includes doubao-embedding-large", () => {
    const large = VOLCENGINE_EMBEDDING_MODELS.find((m) => m.id === "doubao-embedding-large");
    expect(large).toBeDefined();
    expect(large!.contextWindow).toBe(4096);
  });

  it("has no duplicate model ids", () => {
    const ids = VOLCENGINE_EMBEDDING_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
