/**
 * Orchestrator Model Gate
 *
 * Validates that the current model meets the minimum requirements for
 * multi-agent orchestration (8K+ context hard min, 32K+ recommended, mid+ tier).
 *
 * Design: Pure function, no side effects. Reads from provider-capability-mapping
 * and tier-selector at the edges, returns a verdict.
 */

import type { ModelGateResult, ModelTier } from "./types.js";

// ── Known SOTA models with 128K+ context ─────────────────────────────────

// Tier classification aligns with the real cost-based tier-selector:
//   cheap: total cost ≤ $2/1M tokens
//   mid:   $2 < total cost ≤ $20/1M tokens
//   sota:  total cost > $20/1M tokens
// Context windows from provider-capability-mapping and models-config.providers.
const KNOWN_ELIGIBLE_MODELS: Record<string, { contextWindow: number; tier: ModelTier }> = {
  // ── DeepSeek ──
  "deepseek-chat": { contextWindow: 64000, tier: "cheap" }, // $1.37/1M
  "deepseek-reasoner": { contextWindow: 64000, tier: "mid" }, // $2.74/1M
  "deepseek-coder": { contextWindow: 64000, tier: "cheap" },
  // ── OpenAI ──
  "gpt-4o": { contextWindow: 128000, tier: "mid" }, // $12.5/1M
  "gpt-4o-2024-11-20": { contextWindow: 128000, tier: "mid" },
  "gpt-4-turbo": { contextWindow: 128000, tier: "sota" }, // $40/1M
  o1: { contextWindow: 200000, tier: "sota" }, // $75/1M
  "o1-preview": { contextWindow: 128000, tier: "sota" },
  o3: { contextWindow: 200000, tier: "sota" }, // $50/1M
  "o3-mini": { contextWindow: 200000, tier: "mid" }, // $5.5/1M
  // ── Anthropic ──
  "claude-3-5-sonnet-20241022": { contextWindow: 200000, tier: "mid" }, // $18/1M
  "claude-sonnet-4-5": { contextWindow: 200000, tier: "mid" }, // $18/1M
  "claude-sonnet-4-20250514": { contextWindow: 200000, tier: "mid" },
  "claude-3-opus-20240229": { contextWindow: 200000, tier: "sota" }, // $90/1M
  "claude-opus-4-20250514": { contextWindow: 200000, tier: "sota" },
  "claude-opus-4-6": { contextWindow: 200000, tier: "sota" },
  // ── Qwen ──
  "qwen-max": { contextWindow: 32000, tier: "mid" }, // $8/1M
  "qwen-plus": { contextWindow: 131072, tier: "cheap" }, // $1.6/1M
  "qwen-turbo": { contextWindow: 131072, tier: "cheap" }, // $0.4/1M
  "qwen-coder-plus": { contextWindow: 131072, tier: "mid" },
  "qwen-long": { contextWindow: 1000000, tier: "cheap" },
  // ── Doubao (ByteDance) ──
  "doubao-seed-1-8-251228": { contextWindow: 256000, tier: "mid" },
  "doubao-seed-1-6-251015": { contextWindow: 256000, tier: "mid" },
  "doubao-seed-1-6-lite-251015": { contextWindow: 256000, tier: "cheap" },
  // ── GLM (Zhipu) ──
  "glm-5": { contextWindow: 128000, tier: "mid" },
  "glm-5-code": { contextWindow: 128000, tier: "mid" },
  "glm-4-plus": { contextWindow: 128000, tier: "cheap" }, // $1.4/1M
  "glm-4-long": { contextWindow: 1000000, tier: "cheap" },
  "glm-4.7": { contextWindow: 128000, tier: "mid" },
  "glm-4.5": { contextWindow: 128000, tier: "mid" },
  // ── Moonshot / Kimi ──
  "moonshot-v1-128k": { contextWindow: 128000, tier: "mid" }, // $16.8/1M
  "kimi-for-coding": { contextWindow: 262144, tier: "mid" },
  // ── MiniMax ──
  "minimax-m2.5": { contextWindow: 200000, tier: "mid" },
  "minimax-m2.1": { contextWindow: 200000, tier: "mid" },
  // ── SiliconFlow ──
  "deepseek-ai/deepseek-v3": { contextWindow: 65536, tier: "mid" },
  // ── Qianfan ──
  "ernie-5.0-thinking-preview": { contextWindow: 119000, tier: "mid" },
};

// Minimum context for orchestration planning (not for the child agents).
// The orchestrator needs to parse requirements + generate blueprints + SOUL.md,
// which typically fits within 32K. We warn at 32K, block below 8K.
const MIN_CONTEXT_WINDOW = 8_000;
const WARN_CONTEXT_WINDOW = 32_000;

const SUGGESTED_MODELS = [
  "deepseek-reasoner (DeepSeek, 64K context, mid tier)",
  "claude-sonnet-4-5 (Anthropic, 200K context, mid tier)",
  "gpt-4o (OpenAI, 128K context, mid tier)",
  "doubao-seed-1-8-251228 (Doubao, 256K context, mid tier)",
  "kimi-for-coding (Kimi, 262K context, mid tier)",
  "glm-5 (Zhipu, 128K context, mid tier)",
];

/**
 * Check whether a model is eligible to serve as the orchestrator.
 *
 * Rules:
 *   1. Context window must be >= 128K
 *   2. Tier should be "sota" (warning for "mid", reject "cheap")
 *
 * Falls back to the known model table when runtime lookup is unavailable.
 */
export function checkModelEligibility(
  modelId: string,
  runtimeInfo?: {
    contextWindow?: number;
    tier?: ModelTier;
  },
): ModelGateResult {
  const normalizedId = modelId.toLowerCase().trim();

  // Try runtime info first (from tier-selector / model probe)
  let contextWindow = runtimeInfo?.contextWindow;
  let tier = runtimeInfo?.tier;

  // Fall back to known model table
  if (contextWindow === undefined || tier === undefined) {
    const known = findKnownModel(normalizedId);
    if (known) {
      contextWindow ??= known.contextWindow;
      tier ??= known.tier;
    }
  }

  // If we still don't know, be lenient — allow with warning
  if (contextWindow === undefined) {
    return {
      eligible: true,
      modelId,
      reason:
        `Unknown model "${modelId}". Cannot verify context window. ` +
        `Proceeding with caution — orchestration quality may vary.`,
      suggestions: SUGGESTED_MODELS,
    };
  }

  // Check context window — hard block below 8K, warn below 32K
  if (contextWindow < MIN_CONTEXT_WINDOW) {
    return {
      eligible: false,
      modelId,
      contextWindow,
      tier,
      reason:
        `Model "${modelId}" has ${formatTokens(contextWindow)} context window. ` +
        `Agent orchestration requires at least ${formatTokens(MIN_CONTEXT_WINDOW)}. ` +
        `The orchestrator needs to parse requirements and generate agent blueprints.`,
      suggestions: SUGGESTED_MODELS,
    };
  }

  if (contextWindow < WARN_CONTEXT_WINDOW) {
    return {
      eligible: true,
      modelId,
      contextWindow,
      tier,
      reason:
        `Model "${modelId}" has ${formatTokens(contextWindow)} context window. ` +
        `Orchestration works best with 32K+ context. ` +
        `Complex plans with many agents may be truncated.`,
      suggestions: SUGGESTED_MODELS,
    };
  }

  // Check tier
  if (tier === "cheap") {
    return {
      eligible: false,
      modelId,
      contextWindow,
      tier,
      reason:
        `Model "${modelId}" is classified as "cheap" tier. ` +
        `Agent orchestration requires strong reasoning ability to plan effectively. ` +
        `Cheap-tier models produce unreliable plans and low-quality SOUL.md files.`,
      suggestions: SUGGESTED_MODELS,
    };
  }

  if (tier === "mid") {
    return {
      eligible: true,
      modelId,
      contextWindow,
      tier,
      reason:
        `Model "${modelId}" is "mid" tier — usable but not optimal. ` +
        `SOTA-tier models produce significantly better orchestration plans. ` +
        `Consider upgrading for complex multi-agent scenarios.`,
    };
  }

  // SOTA + 128K+ — fully eligible
  return {
    eligible: true,
    modelId,
    contextWindow,
    tier,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Pre-sorted keys longest-first for correct prefix matching
// (e.g. "gpt-4o-2024-11-20" must match before "gpt-4o")
const KNOWN_MODEL_KEYS = Object.keys(KNOWN_ELIGIBLE_MODELS).sort((a, b) => b.length - a.length);

function findKnownModel(
  normalizedId: string,
): { contextWindow: number; tier: ModelTier } | undefined {
  // Exact match
  if (KNOWN_ELIGIBLE_MODELS[normalizedId]) {
    return KNOWN_ELIGIBLE_MODELS[normalizedId];
  }
  // Prefix match, longest key first to avoid greedy short-prefix matches
  for (const key of KNOWN_MODEL_KEYS) {
    if (normalizedId.startsWith(key)) {
      return KNOWN_ELIGIBLE_MODELS[key];
    }
  }
  return undefined;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
