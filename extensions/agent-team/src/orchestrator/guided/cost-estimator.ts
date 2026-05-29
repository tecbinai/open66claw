/**
 * Cost Estimator
 *
 * Estimates daily token cost for a team of agents based on their
 * model selection and usage volume.
 *
 * NOTE: These are rough estimates for UI display only. Actual costs may
 * differ significantly — input/output token prices are not distinguished,
 * and the volume assumptions (50K/200K/800K tokens/day) are approximations.
 * The displayed range is always +/-50% of the point estimate.
 */

import type { InferredCapabilities, UserContext } from "../types.js";

// Approximate cost per 1M tokens (input + output weighted) in CNY
const MODEL_COST_MAP: Record<string, number> = {
  // cheap
  "deepseek/deepseek-chat": 1.0,
  "qwen/qwen-turbo": 0.3,
  "qwen/qwen-plus": 1.2,
  "zhipu/glm-4-plus": 1.0,
  "doubao/doubao-seed-1-6-lite-251015": 0.5,
  // mid
  "deepseek/deepseek-reasoner": 2.0,
  "openai/gpt-4o": 9.0,
  "anthropic/claude-sonnet-4-5": 13.0,
  "zhipu/glm-5": 3.0,
  "doubao/doubao-seed-1-8-251228": 4.0,
  "kimi-coding/kimi-for-coding": 6.0,
  "qwen/qwen-max": 6.0,
  // sota
  "anthropic/claude-opus-4-6": 65.0,
  "openai/o3": 36.0,
};

// Volume → average tokens per day
const VOLUME_TOKENS: Record<string, number> = {
  low: 50_000, // ~50K tokens/day
  medium: 200_000, // ~200K tokens/day
  high: 800_000, // ~800K tokens/day
};

/**
 * Estimate daily cost for a single agent in CNY.
 */
export function estimateAgentDailyCost(
  capabilities: InferredCapabilities,
  volume: UserContext["volume"],
): number {
  const modelId = capabilities.model.primary;
  const costPer1M = MODEL_COST_MAP[modelId] ?? 2.0; // default mid
  const tokensPerDay = VOLUME_TOKENS[volume] ?? VOLUME_TOKENS.medium;

  return (tokensPerDay / 1_000_000) * costPer1M;
}

/**
 * Estimate total daily cost for a team of agents.
 */
export function estimateTeamDailyCost(
  agents: Array<{ inferredCapabilities?: InferredCapabilities }>,
  volume: UserContext["volume"],
): number {
  let total = 0;
  for (const agent of agents) {
    if (agent.inferredCapabilities) {
      total += estimateAgentDailyCost(agent.inferredCapabilities, volume);
    }
  }
  return total;
}

/**
 * Format cost as user-friendly CNY string.
 */
function formatCost(costCNY: number): string {
  if (costCNY < 0.01) return "< ¥0.01";
  if (costCNY < 1) return `¥${costCNY.toFixed(2)}`;
  if (costCNY < 10) return `¥${costCNY.toFixed(1)}`;
  return `¥${Math.round(costCNY)}`;
}

/**
 * Format a cost range (±50%) for display.
 */
export function formatCostRange(costCNY: number): string {
  const low = costCNY * 0.5;
  const high = costCNY * 1.5;
  return `${formatCost(low)}-${formatCost(high)}`;
}
