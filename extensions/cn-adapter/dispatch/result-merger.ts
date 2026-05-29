/**
 * Result Merger — combines outputs from parallel worker agents.
 *
 * Simplified from clawdbot's result-merger.ts:
 * - Only supports "concatenate" and "vote" strategies (no LLM dependency)
 * - Removed "synthesize" and "best_of_n" (require LLM calls)
 *
 * To add LLM-based merge strategies later, extend the switch in mergeWorkerResults().
 */

import { createCnLogger } from "../utils/logger.js";
import type { MergeStrategy, WorkerResult } from "./types.js";

const log = createCnLogger("result-merger");

// ---------------------------------------------------------------------------
// Strategy: Concatenation (deduplicated)
// ---------------------------------------------------------------------------

function mergeByConcatenation(results: WorkerResult[]): string {
  const successful = results.filter((r) => r.status === "ok" && r.output.trim());
  if (successful.length === 0) {
    return "All workers failed to produce results.";
  }

  // Simple dedup by exact match (case-insensitive)
  const seen = new Set<string>();
  const unique: WorkerResult[] = [];
  for (const r of successful) {
    const key = r.output.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  if (unique.length === 1) {
    return unique[0]!.output;
  }

  return unique
    .map((r, i) => `### Part ${i + 1}: ${r.task}\n\n${r.output.trim()}`)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Strategy: Vote (majority consensus)
// ---------------------------------------------------------------------------

function mergeByVote(results: WorkerResult[]): string {
  const successful = results.filter((r) => r.status === "ok" && r.output.trim());
  if (successful.length === 0) {
    return "All workers failed to produce results.";
  }

  // Count normalized outputs
  const counts = new Map<string, { count: number; original: string }>();
  for (const r of successful) {
    const key = r.output.trim().toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, original: r.output.trim() });
    }
  }

  // Return the most common answer
  let best = { count: 0, original: "" };
  for (const entry of counts.values()) {
    if (entry.count > best.count) {
      best = entry;
    }
  }

  return best.original;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge worker results using the specified strategy.
 *
 * Only "concatenate" and "vote" are supported. Unknown strategies fall back
 * to concatenation.
 */
export function mergeWorkerResults(params: {
  results: WorkerResult[];
  originalTask: string;
  strategy: MergeStrategy;
}): string {
  const { results, strategy } = params;

  if (results.length === 0) {
    return "No worker results available.";
  }

  const successCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.length - successCount;
  if (failCount > 0) {
    log.info(
      `Merging ${successCount} successful / ${failCount} failed results (strategy=${strategy})`,
    );
  }

  switch (strategy) {
    case "concatenate":
      return mergeByConcatenation(results);

    case "vote":
      return mergeByVote(results);

    default:
      log.warn(`Unknown merge strategy "${strategy}", falling back to concatenation`);
      return mergeByConcatenation(results);
  }
}
