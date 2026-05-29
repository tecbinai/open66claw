/**
 * Step Runner — stub implementation with hook point for future LLM integration.
 *
 * This is a skeleton of clawdbot's step-runner.ts:
 * - Removed direct LLM calls (no llm-classify dependency)
 * - Kept validation, retry, and context injection logic
 * - Provides a `createStepRunner()` factory that accepts a pluggable executor
 * - Default executor returns a placeholder (for testing/future LLM hookup)
 *
 * To integrate LLM calls later, pass a custom executor to `createStepRunner()`.
 */

import { createCnLogger } from "../utils/logger.js";
import type { Subtask, WorkerResult, StepRunnerFn } from "./types.js";

const log = createCnLogger("step-runner");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;
const MIN_OUTPUT_LENGTH = 10;

/**
 * Markers at the start of output that indicate a refusal or error.
 * When an output starts with any of these, it triggers a retry.
 */
const ERROR_MARKERS = [
  "I cannot fulfill",
  "I cannot complete",
  "I'm sorry, I can't",
  "I'm unable to complete",
  "I'm unable to fulfill",
  "Error: ",
  "ERROR: ",
  "无法完成",
  "抱歉，我无法完成",
  "很抱歉，我无法",
];

// ---------------------------------------------------------------------------
// Output Validation
// ---------------------------------------------------------------------------

type ValidationResult = { isValid: boolean; errors: string[] };

function validateOutput(output: string): ValidationResult {
  const errors: string[] = [];

  if (!output || output.trim().length < MIN_OUTPUT_LENGTH) {
    errors.push("output_too_short");
  }

  const trimmed = output.trim();
  for (const marker of ERROR_MARKERS) {
    if (trimmed.startsWith(marker)) {
      errors.push(`error_marker:${marker}`);
      break;
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Executor Type (pluggable hook point)
// ---------------------------------------------------------------------------

/**
 * The actual execution function that produces output for a subtask.
 * This is the hook point for LLM integration.
 *
 * Default: returns a placeholder string (useful for testing the orchestration
 * pipeline without LLM costs).
 */
export type StepExecutor = (params: {
  systemPrompt: string;
  userPrompt: string;
  timeBudgetMs: number;
  signal?: AbortSignal;
}) => Promise<string | null>;

/**
 * Default executor — returns a structured placeholder.
 * Replace with an LLM call for production use.
 */
export const defaultExecutor: StepExecutor = async (params) => {
  return `[stub] Task received: ${params.userPrompt.slice(0, 200)}`;
};

// ---------------------------------------------------------------------------
// Worker Prompt Construction
// ---------------------------------------------------------------------------

function buildWorkerSystemPrompt(
  node: Subtask,
  originalTask: string,
  dependencyContext: string,
): string {
  const parts: string[] = [
    `You are a ${node.role}. Your job is to complete the specific subtask assigned to you.`,
    "",
    `Original user request (for context): ${originalTask}`,
  ];

  if (dependencyContext) {
    parts.push("");
    parts.push("Results from prior steps (use as input for your work):");
    parts.push(dependencyContext);
  }

  parts.push("");
  parts.push(
    "Complete your assigned subtask thoroughly and provide a clear, well-structured response.",
  );
  parts.push("Focus only on your specific subtask — other parts are handled by other workers.");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a StepRunnerFn with a pluggable executor.
 *
 * @param executor - The function that actually produces output. Defaults to stub.
 * @param maxRetries - Maximum retry attempts on validation failure. Default: 2.
 */
export function createStepRunner(
  executor: StepExecutor = defaultExecutor,
  maxRetries = DEFAULT_MAX_RETRIES,
): StepRunnerFn {
  return async (params) => {
    const { node, dependencyContext, originalTask, timeBudgetMs, signal } = params;
    const startTime = performance.now();
    const validationErrors: string[] = [];
    let retryCount = 0;
    let lastOutput = "";
    let lastStatus: WorkerResult["status"] = "error";

    const systemPrompt = buildWorkerSystemPrompt(node, originalTask, dependencyContext);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      retryCount = attempt;

      // Check abort
      if (signal?.aborted) {
        return makeResult(node.id, node.task, "timeout", lastOutput, startTime, retryCount);
      }

      // Check time budget
      const elapsed = performance.now() - startTime;
      if (elapsed > timeBudgetMs) {
        return makeResult(node.id, node.task, "timeout", lastOutput, startTime, retryCount);
      }

      try {
        const remainingBudget = timeBudgetMs - (performance.now() - startTime);
        const result = await executor({
          systemPrompt,
          userPrompt: node.task,
          timeBudgetMs: Math.max(5_000, remainingBudget),
          signal,
        });

        lastOutput = result?.trim() ?? "";

        // Post-validation
        const validation = validateOutput(lastOutput);
        if (validation.isValid) {
          lastStatus = "ok";
          break;
        }

        // Validation failed
        validationErrors.push(...validation.errors);

        if (attempt < maxRetries) {
          const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
          log.debug(
            `Step ${node.id} validation failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
              `retrying in ${backoffMs}ms`,
          );
          await sleep(backoffMs);
        } else {
          lastStatus = "error";
        }
      } catch (err) {
        lastOutput = `Error: ${err instanceof Error ? err.message : String(err)}`;
        lastStatus = "error";

        if (attempt < maxRetries) {
          const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await sleep(backoffMs);
        }
      }
    }

    log.info(
      `Step ${node.id} [${node.role}]: status=${lastStatus} retries=${retryCount} ${(performance.now() - startTime).toFixed(0)}ms`,
    );

    return makeResult(node.id, node.task, lastStatus, lastOutput, startTime, retryCount);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  taskId: string,
  task: string,
  status: WorkerResult["status"],
  output: string,
  startTime: number,
  retryCount: number,
): WorkerResult {
  return {
    taskId,
    task,
    output,
    status,
    durationMs: performance.now() - startTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
