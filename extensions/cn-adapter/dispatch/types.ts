/**
 * Dispatch Types — simplified type definitions for the orchestrator engine.
 *
 * Stripped-down version of clawdbot's dispatch/types.ts:
 * - Removed LLM classifier config (no LLM dependency)
 * - Removed budget/cost tracking (not needed in cn-adapter)
 * - Kept core dispatch routing, intent, complexity, and execution types
 * - References cn-adapter's existing ToolFilterMode/ToolFilterPolicy
 */

import type { ToolFilterMode, ToolFilterPolicy } from "./tool-filter-rules.js";

// ---------------------------------------------------------------------------
// Intent & Patterns
// ---------------------------------------------------------------------------

export type DispatchPatterns = {
  keywords: string[];
  regex: string[];
  /** Keywords that suppress this intent when present (anti-false-positive). */
  excludeKeywords?: string[];
};

export type IntentDefinition = {
  id: string;
  description: string;
  patterns: DispatchPatterns;
  /** Skills associated with this intent. */
  skills: string[];
  /** Extra system prompt hint injected when this intent is matched. */
  systemHint?: string;
  /** Custom synonym groups for enriched keyword matching. */
  synonyms?: string[][];
};

// ---------------------------------------------------------------------------
// Compiled Config (pre-processed for fast matching)
// ---------------------------------------------------------------------------

export type CompiledIntent = IntentDefinition & {
  /** Pre-compiled regex patterns for fast matching. */
  compiledRegex: RegExp[];
  /** Lowercased keywords for matching. */
  lowerKeywords: string[];
  /** Lowercased exclude keywords for false-positive suppression. */
  lowerExcludeKeywords?: string[];
};

// ---------------------------------------------------------------------------
// Classification Results
// ---------------------------------------------------------------------------

export type RuleMatchResult = {
  intentId: string;
  confidence: number;
  matchedBy: "keyword" | "regex" | "combined";
  matchDetails: string;
};

// ---------------------------------------------------------------------------
// Complexity & Execution Strategy
// ---------------------------------------------------------------------------

/** Task complexity level. */
export type ComplexityLevel = "low" | "medium" | "high";

/**
 * Execution strategy derived from complexity + intent.
 * - "single": One agent, cheapest model adequate for the task.
 * - "enhanced": One agent, stronger model with deeper thinking.
 * - "multi": Orchestrator agent spawns parallel worker sub-agents.
 */
export type ExecutionStrategy = "single" | "enhanced" | "multi";

// ---------------------------------------------------------------------------
// Routing Decision (output of the dispatch engine)
// ---------------------------------------------------------------------------

export type RoutingDecision = {
  intent: string;
  confidence: number;
  classifierUsed: "rules" | "default";
  skillHints: string[];
  toolHints?: string[];
  systemHint?: string;
  /** Task complexity level. Defaults to "medium". */
  complexity: ComplexityLevel;
  /** Execution strategy. Defaults to "single". */
  strategy: ExecutionStrategy;
  /** Signals that contributed to the complexity assessment. */
  complexitySignals?: string[];
  /** Tool filter policy built from intent + discovery results. */
  toolFilterPolicy?: ToolFilterPolicy;
  /** Tool filter mode. */
  toolFilterMode?: ToolFilterMode;
};

// ---------------------------------------------------------------------------
// Orchestration Types
// ---------------------------------------------------------------------------

/** A subtask produced by task decomposition. */
export type Subtask = {
  id: string;
  task: string;
  role: string;
  dependsOn: string[];
};

/** Merge strategy for combining worker results. */
export type MergeStrategy = "concatenate" | "vote";

/** Result of task decomposition. */
export type DecompositionResult = {
  subtasks: Subtask[];
  mergeStrategy: MergeStrategy;
};

/** Result from a single worker. */
export type WorkerResult = {
  taskId: string;
  task: string;
  output: string;
  status: "ok" | "error" | "timeout";
  durationMs?: number;
};

/**
 * Step runner function signature.
 * The orchestrator accepts a pluggable step runner so that:
 * - Tests can inject mocks
 * - Future LLM integration can be added without changing the orchestrator
 */
export type StepRunnerFn = (params: {
  node: Subtask;
  dependencyContext: string;
  originalTask: string;
  timeBudgetMs: number;
  signal?: AbortSignal;
}) => Promise<WorkerResult>;
