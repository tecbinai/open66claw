/**
 * Orchestrator — multi-agent task orchestration engine (stub skeleton).
 *
 * Simplified from clawdbot's orchestrator.ts:
 * - No LLM-based task decomposition (decomposeTask is a pluggable hook)
 * - No resource-guard or config-loader dependency
 * - No auto-reply types dependency
 * - Core flow preserved: decompose → execute (DAG) → merge
 * - Step runner is pluggable via createStepRunner()
 *
 * To enable full orchestration later:
 * 1. Provide a real decomposer (LLM-based or rule-based)
 * 2. Provide a real step executor via createStepRunner(llmExecutor)
 * 3. Optionally register as gateway method: cn.dispatch.orchestrate
 */

import { createCnLogger } from "../utils/logger.js";
import { executeDag, type DagNode } from "./dag-executor.js";
import { createWorkspace } from "./execution-workspace.js";
import { mergeWorkerResults } from "./result-merger.js";
import { createStepRunner, type StepExecutor } from "./step-runner.js";
import type {
  DecompositionResult,
  MergeStrategy,
  RoutingDecision,
  Subtask,
  WorkerResult,
} from "./types.js";

const log = createCnLogger("orchestrator");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_WORKERS = 4;
const DEFAULT_TIME_BUDGET_MS = 120_000;
const DEFAULT_MAX_PARALLELISM = 4;

// ---------------------------------------------------------------------------
// Decomposer Type (pluggable hook point)
// ---------------------------------------------------------------------------

/**
 * Task decomposer function. Takes a task + intent and returns subtasks.
 *
 * Default: returns null (decomposition not available), causing orchestrator
 * to fall back gracefully.
 *
 * Replace with LLM-based decomposition for production use.
 */
export type TaskDecomposer = (params: {
  task: string;
  intent: string;
}) => Promise<DecompositionResult | null>;

/** Default decomposer — always returns null (no decomposition). */
export const defaultDecomposer: TaskDecomposer = async () => null;

// ---------------------------------------------------------------------------
// Orchestration Config
// ---------------------------------------------------------------------------

export type OrchestrationConfig = {
  /** The user's task/prompt. */
  task: string;
  /** Routing decision from the classifier. */
  decision: RoutingDecision;
  /** Task decomposer. Default: returns null. */
  decomposer?: TaskDecomposer;
  /** Step executor for the DAG runner. Default: stub executor. */
  stepExecutor?: StepExecutor;
  /** Maximum parallel workers per wave. Default: 4. */
  maxParallelism?: number;
  /** Total time budget (ms). Default: 120_000. */
  timeBudgetMs?: number;
  /** Abort signal. */
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// Orchestration Result
// ---------------------------------------------------------------------------

export type OrchestrationResult = {
  /** Merged output text. */
  text: string;
  /** Number of subtasks executed. */
  subtaskCount: number;
  /** Merge strategy used. */
  mergeStrategy: MergeStrategy;
  /** Total execution time (ms). */
  durationMs: number;
  /** Whether the DAG execution timed out. */
  timedOut: boolean;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run multi-agent orchestration.
 *
 * Flow:
 * 1. Decompose task into subtasks (via pluggable decomposer)
 * 2. Execute subtasks via DAG executor (topological wave scheduling)
 * 3. Merge results using the decomposer's chosen strategy
 *
 * Returns undefined if decomposition fails or task is not parallelizable,
 * signaling the caller to fall back to single-agent mode.
 */
export async function runOrchestration(
  config: OrchestrationConfig,
): Promise<OrchestrationResult | undefined> {
  const {
    task,
    decision,
    decomposer = defaultDecomposer,
    stepExecutor,
    maxParallelism = DEFAULT_MAX_PARALLELISM,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
    signal,
  } = config;

  const startTime = performance.now();

  // 1. Decompose task
  log.info(`Decomposing task (intent=${decision.intent}, complexity=${decision.complexity})`);

  const decomposition = await decomposer({ task, intent: decision.intent });

  if (!decomposition) {
    log.info("Decomposition failed or task not parallelizable, falling back to single agent");
    return undefined;
  }

  const { subtasks, mergeStrategy } = decomposition;
  const limitedSubtasks = subtasks.slice(0, MAX_WORKERS);

  log.info(
    `Decomposed into ${limitedSubtasks.length} subtasks (merge=${mergeStrategy}): ` +
      limitedSubtasks.map((s) => `[${s.id}] ${s.role}`).join(", "),
  );

  // 2. Execute via DAG executor
  const workspace = createWorkspace();
  const runStep = createStepRunner(stepExecutor);

  const dagNodes: DagNode[] = limitedSubtasks.map((st) => ({
    id: st.id,
    task: st.task,
    role: st.role,
    dependsOn: st.dependsOn,
  }));

  const dagResult = await executeDag(dagNodes, {
    timeBudgetMs,
    maxParallelism,
    originalTask: task,
    workspace,
    signal,
    runStep,
  });

  // Convert DAG results to WorkerResults
  const workerResults: WorkerResult[] = [...dagResult.results.values()].map((r) => ({
    taskId: r.taskId,
    task: limitedSubtasks.find((s) => s.id === r.taskId)?.task ?? "",
    output: r.output,
    status: r.status,
    durationMs: r.durationMs,
  }));

  const successCount = workerResults.filter((r) => r.status === "ok").length;
  if (successCount === 0) {
    log.warn("All workers failed");
    return undefined;
  }

  // 3. Merge results
  log.info(
    `Merging ${successCount}/${workerResults.length} worker results (strategy=${mergeStrategy})`,
  );
  const merged = mergeWorkerResults({
    results: workerResults,
    originalTask: task,
    strategy: mergeStrategy,
  });

  const durationMs = performance.now() - startTime;
  log.info(`Orchestration complete in ${durationMs.toFixed(0)}ms`);

  return {
    text: merged,
    subtaskCount: limitedSubtasks.length,
    mergeStrategy,
    durationMs,
    timedOut: dagResult.timedOut,
  };
}
