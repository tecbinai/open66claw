import { describe, it, expect } from "vitest";
import {
  buildSiliconFlowProvider,
  SILICONFLOW_PROVIDER_ID,
  SILICONFLOW_BASE_URL,
  SILICONFLOW_ENV_VAR,
  SILICONFLOW_MODELS,
} from "../siliconflow.js";

describe("buildSiliconFlowProvider", () => {
  const provider = buildSiliconFlowProvider();

  it("returns correct provider id", () => {
    expect(provider.id).toBe(SILICONFLOW_PROVIDER_ID);
    expect(provider.id).toBe("siliconflow");
  });

  it("has label and aliases for Chinese users", () => {
    expect(provider.label).toContain("硅基流动");
    expect(provider.aliases).toContain("硅基流动");
    expect(provider.aliases).toContain("sf");
  });

  it("declares SILICONFLOW_API_KEY env var", () => {
    expect(provider.envVars).toContain(SILICONFLOW_ENV_VAR);
  });

  it("uses openai-completions API", () => {
    expect(provider.models?.api).toBe("openai-completions");
  });

  it("has correct base URL", () => {
    expect(provider.models?.baseUrl).toBe(SILICONFLOW_BASE_URL);
    expect(provider.models?.baseUrl).toBe("https://api.siliconflow.cn/v1");
  });

  it("has at least 5 models", () => {
    expect(provider.models?.models.length).toBeGreaterThanOrEqual(5);
  });

  it("has api_key auth method", () => {
    expect(provider.auth).toHaveLength(1);
    expect(provider.auth[0].kind).toBe("api_key");
    expect(provider.auth[0].id).toBe("api-key");
  });
});

describe("SILICONFLOW_MODELS", () => {
  it("every model has required fields", () => {
    for (const model of SILICONFLOW_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.reasoning).toBe("boolean");
      expect(model.input.length).toBeGreaterThan(0);
      expect(model.contextWindow).toBeGreaterThanOrEqual(0);
      expect(model.maxTokens).toBeGreaterThanOrEqual(0);
      expect(model.cost).toHaveProperty("input");
      expect(model.cost).toHaveProperty("output");
    }
  });

  it("includes DeepSeek V3 as recommended default", () => {
    const ds = SILICONFLOW_MODELS.find((m) => m.id === "deepseek-ai/DeepSeek-V3");
    expect(ds).toBeDefined();
    expect(ds!.reasoning).toBe(false);
  });

  it("includes reasoning models (DeepSeek R1, QVQ)", () => {
    const reasoning = SILICONFLOW_MODELS.filter((m) => m.reasoning);
    expect(reasoning.length).toBeGreaterThanOrEqual(2);
  });

  it("includes vision model (QVQ)", () => {
    const vision = SILICONFLOW_MODELS.find((m) => m.input.includes("image") && m.id.includes("QVQ"));
    expect(vision).toBeDefined();
    expect(vision!.id).toContain("QVQ");
  });

  it("includes image generation models", () => {
    const imageGen = SILICONFLOW_MODELS.filter((m) =>
      /qwen[/-]image|kolors|flux|stable-diffusion/i.test(m.id),
    );
    expect(imageGen.length).toBeGreaterThanOrEqual(4);
  });

  it("includes video generation models", () => {
    const videoGen = SILICONFLOW_MODELS.filter((m) => /wan-ai|t2v/i.test(m.id));
    expect(videoGen.length).toBeGreaterThanOrEqual(2);
  });

  it("includes embedding models", () => {
    const embedding = SILICONFLOW_MODELS.filter((m) => /bge/i.test(m.id));
    expect(embedding.length).toBeGreaterThanOrEqual(2);
  });

  it("has no duplicate model ids", () => {
    const ids = SILICONFLOW_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
