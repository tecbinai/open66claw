import { describe, it, expect } from "vitest";
import { checkModelEligibility } from "./model-gate.js";

describe("model-gate", () => {
  describe("checkModelEligibility", () => {
    // ── Known models — tier and context checks ──

    it("allows sota model with large context", () => {
      const result = checkModelEligibility("claude-opus-4-6");
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("sota");
      expect(result.contextWindow).toBe(200000);
      expect(result.reason).toBeUndefined();
    });

    it("allows mid-tier model with warning", () => {
      const result = checkModelEligibility("gpt-4o");
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("mid");
      expect(result.reason).toContain("mid");
      expect(result.reason).toContain("not optimal");
    });

    it("blocks cheap-tier model", () => {
      const result = checkModelEligibility("qwen-turbo");
      expect(result.eligible).toBe(false);
      expect(result.tier).toBe("cheap");
      expect(result.reason).toContain("cheap");
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it("blocks deepseek-chat as cheap tier", () => {
      const result = checkModelEligibility("deepseek-chat");
      expect(result.eligible).toBe(false);
      expect(result.tier).toBe("cheap");
    });

    // ── Context window thresholds ──

    it("blocks model with context below 8K", () => {
      const result = checkModelEligibility("tiny-model", {
        contextWindow: 4000,
        tier: "sota",
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("8.0K");
    });

    it("allows model with context between 8K-32K with warning", () => {
      const result = checkModelEligibility("small-model", {
        contextWindow: 16000,
        tier: "mid",
      });
      expect(result.eligible).toBe(true);
      expect(result.reason).toContain("32K");
      expect(result.reason).toContain("truncated");
    });

    it("allows model with 32K+ context without context warning", () => {
      const result = checkModelEligibility("good-model", {
        contextWindow: 64000,
        tier: "mid",
      });
      expect(result.eligible).toBe(true);
      // Still has mid-tier warning though
      expect(result.reason).toContain("mid");
      expect(result.reason).not.toContain("truncated");
    });

    // ── CN model coverage ──

    it("recognizes kimi-for-coding", () => {
      const result = checkModelEligibility("kimi-for-coding");
      expect(result.eligible).toBe(true);
      expect(result.contextWindow).toBe(262144);
    });

    it("recognizes doubao-seed-1-8-251228", () => {
      const result = checkModelEligibility("doubao-seed-1-8-251228");
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("mid");
      expect(result.contextWindow).toBe(256000);
    });

    it("recognizes glm-5", () => {
      const result = checkModelEligibility("glm-5");
      expect(result.eligible).toBe(true);
      expect(result.contextWindow).toBe(128000);
    });

    it("recognizes deepseek-reasoner as mid tier", () => {
      const result = checkModelEligibility("deepseek-reasoner");
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("mid");
    });

    // ── Prefix matching ──

    it("matches model with version suffix via prefix", () => {
      const result = checkModelEligibility("gpt-4o-2024-12-01");
      // Should match gpt-4o prefix
      expect(result.eligible).toBe(true);
    });

    // ── Unknown model ──

    it("allows unknown model with caution warning", () => {
      const result = checkModelEligibility("completely-unknown-model-xyz");
      expect(result.eligible).toBe(true);
      expect(result.reason).toContain("Unknown model");
      expect(result.reason).toContain("caution");
    });

    // ── Case insensitivity ──

    it("handles case-insensitive model ids", () => {
      const result = checkModelEligibility("Claude-Opus-4-6");
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("sota");
    });

    // ── Runtime info override ──

    it("uses runtime info over known model table", () => {
      const result = checkModelEligibility("deepseek-chat", {
        contextWindow: 128000,
        tier: "mid",
      });
      // Runtime says mid + 128K → should be eligible with mid warning
      expect(result.eligible).toBe(true);
      expect(result.tier).toBe("mid");
      expect(result.contextWindow).toBe(128000);
    });
  });
});
