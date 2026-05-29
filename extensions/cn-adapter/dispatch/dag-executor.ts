/**
 * DAG Executor — topological wave-based execution engine.
 *
 * Ported from clawdbot's dag-executor.ts with simplifications:
 * - Uses cn-adapter logger instead of createSubsystemLogger
 * - Step runner is always injected (no dynamic import of llm-classify)
 * - Uses cn-adapter's execution-workspace types
 *
 * Core algorithm (Kahn's topological sort + wave scheduling) is preserved.
 */

import { createCnLogger } from "../utils/logger.js";
import type { ExecutionWorkspace, StepOutputStatus } from "./execution-workspace.js";
import type { Subtask, StepRunnerFn, WorkerResult } from "./types.js";

const log = createCnLogger("dag-executor");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node in the execution DAG (extends Subtask with optional condition). */
export type DagNode = Subtask & {
  /** Conditional execution: only run when the referenced step matches. */
  condition?: {
    stepId: string;
    field: "output" | "status";
    expect: string | "truthy" | "falsy";
  };
  /** Maximum retries for this step. */
  maxRetries?: number;
};

/** Configuration for DAG execution. */
export type DagExecutionConfig = {
  /** Total time budget for the entire DAG (ms). Default: 120_000. */
  timeBudgetMs: number;
  /** Maximum parallel workers per wave. Default: 4. */
  maxParallelism: number;
  /** Original user task (injected into each step's context). */
  originalTask: string;
  /** Shared execution workspace for context passing. */
  workspace: ExecutionWorkspace;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Step runner function (required — no default LLM runner). */
  runStep: StepRunnerFn;
};

/** Result of a full DAG execution. */
export type DagExecutionResult = {
  /** All step results keyed by step ID. */
  results: Map<string, WorkerResult>;
  /** IDs of steps that were skipped (condition not met). */
  skippedSteps: string[];
  /** Total execution time (ms). */
  totalDurationMs: number;
  /** Whether execution was aborted due to time budget exhaustion. */
  timedOut: boolean;
};

// ---------------------------------------------------------------------------
// Topological Sort — Kahn's Algorithm
// ---------------------------------------------------------------------------

/**
 * Topological sort producing execution "waves".
 *
 * Each wave contains nodes whose dependencies are all in earlier waves.
 * Nodes within the same wave can execute in parallel.
 *
 * @returns Array of waves. Empty array for empty input. Cycles forced into final wave.
 */
export function topologicalWaves(nodes: DagNode[]): DagNode[][] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }

  // Build adjacency + in-degree (only count edges to known nodes)
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (nodeMap.has(dep)) {
        adjList.get(dep)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  const waves: DagNode[][] = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    // Find all nodes with in-degree 0
    const wave: DagNode[] = [];
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        const node = nodeMap.get(id);
        if (node) wave.push(node);
      }
    }

    if (wave.length === 0) {
      // Cycle detected — force remaining into final wave
      log.warn(
        `Cycle detected in DAG among nodes [${[...remaining].join(", ")}], forcing into final wave`,
      );
      const forced = [...remaining]
        .map((id) => nodeMap.get(id))
        .filter((n): n is DagNode => n !== undefined);
      waves.push(forced);
      break;
    }

    waves.push(wave);

    // Remove wave from remaining, update in-degrees
    for (const node of wave) {
      remaining.delete(node.id);
      for (const successor of adjList.get(node.id) ?? []) {
        inDegree.set(successor, (inDegree.get(successor) ?? 0) - 1);
      }
    }
  }

  return waves;
}

// ---------------------------------------------------------------------------
// Condition Evaluator
// ---------------------------------------------------------------------------

function evaluateCondition(
  condition: DagNode["condition"],
  workspace: ExecutionWorkspace,
): boolean {
  if (!condition) return true;

  const stepOutput = workspace.getOutput(condition.stepId);
  if (!stepOutput) return false;

  const value = condition.field === "output" ? stepOutput.output : String(stepOutput.status);

  if (condition.expect === "truthy") return Boolean(value && value.trim());
  if (condition.expect === "falsy") return !value || !value.trim();
  return value === condition.expect;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Build context string from dependency step outputs in the workspace.
 * Only includes successful, non-empty outputs.
 */
function buildDependencyContext(node: DagNode, workspace: ExecutionWorkspace): string {
  if (node.dependsOn.length === 0) return "";

  const parts: string[] = [];
  for (const depId of node.dependsOn) {
    const depOutput = workspace.getOutput(depId);
    if (depOutput && depOutput.status === "ok" && depOutput.output.trim()) {
      parts.push(`[Step ${depId}]:\n${depOutput.output}`);
    }
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// DAG Executor
// ---------------------------------------------------------------------------

export async function executeDag(
  nodes: DagNode[],
  config: DagExecutionConfig,
): Promise<DagExecutionResult> {
  const startTime = performance.now();
  const results = new Map<string, WorkerResult>();
  const skippedSteps: string[] = [];
  let timedOut = false;

  if (nodes.length === 0) {
    return { results, skippedSteps, totalDurationMs: 0, timedOut: false };
  }

  const waves = topologicalWaves(nodes);
  const totalWaves = waves.length;

  log.info(
    `DAG execution: ${nodes.length} nodes in ${totalWaves} waves, ` +
      `budget=${config.timeBudgetMs}ms, parallelism=${config.maxParallelism}`,
  );

  for (let waveIdx = 0; waveIdx < totalWaves; waveIdx++) {
    const wave = waves[waveIdx]!;

    // Check time budget
    const elapsed = performance.now() - startTime;
    const remaining = config.timeBudgetMs - elapsed;
    if (remaining <= 0 || config.signal?.aborted) {
      timedOut = true;
      log.warn(`DAG timed out after ${elapsed.toFixed(0)}ms at wave ${waveIdx + 1}/${totalWaves}`);
      break;
    }

    // Evaluate conditions and partition wave
    const executableNodes: DagNode[] = [];
    for (const node of wave) {
      if (evaluateCondition(node.condition, config.workspace)) {
        executableNodes.push(node);
      } else {
        skippedSteps.push(node.id);
        config.workspace.setOutput(node.id, {
          status: "skipped" as StepOutputStatus,
          output: "",
          durationMs: 0,
        });
      }
    }

    if (executableNodes.length === 0) continue;

    // Time budget per step
    const remainingWaves = totalWaves - waveIdx;
    const perStepBudget = Math.max(5000, remaining / remainingWaves);

    // Execute in chunks respecting maxParallelism
    const chunks = chunkArray(executableNodes, config.maxParallelism);

    for (const chunk of chunks) {
      const stepResults = await Promise.all(
        chunk.map((node) => {
          const depContext = buildDependencyContext(node, config.workspace);
          return config.runStep({
            node,
            dependencyContext: depContext,
            originalTask: config.originalTask,
            timeBudgetMs: perStepBudget,
            signal: config.signal,
          });
        }),
      );

      for (const result of stepResults) {
        results.set(result.taskId, result);
        config.workspace.setOutput(result.taskId, {
          status: result.status as StepOutputStatus,
          output: result.output,
          durationMs: result.durationMs ?? 0,
        });
      }
    }
  }

  const totalDurationMs = performance.now() - startTime;
  log.info(
    `DAG execution complete: ${results.size} executed, ${skippedSteps.length} skipped, ` +
      `${totalDurationMs.toFixed(0)}ms${timedOut ? " (TIMED OUT)" : ""}`,
  );

  return { results, skippedSteps, totalDurationMs, timedOut };
}
