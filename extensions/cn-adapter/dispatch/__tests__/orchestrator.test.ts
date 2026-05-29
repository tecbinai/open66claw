import { describe, it, expect, vi } from "vitest";
import { runOrchestration } from "../orchestrator.js";
import type { TaskDecomposer } from "../orchestrator.js";
import type { StepExecutor } from "../step-runner.js";
import type { RoutingDecision, DecompositionResult } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockDecision: RoutingDecision = {
  intent: "coding",
  confidence: 0.9,
  classifierUsed: "rules",
  skillHints: ["code_write"],
  complexity: "high",
  strategy: "multi",
};

function createMockDecomposer(result: DecompositionResult | null): TaskDecomposer {
  return async () => result;
}

function createMockExecutor(outputs?: Record<string, string>): StepExecutor {
  return async (params) => {
    // Extract task ID from prompt (hack for testing — use the userPrompt as key hint)
    return outputs?.[params.userPrompt] ?? `Executed: ${params.userPrompt.slice(0, 100)}`;
  };
}

// ---------------------------------------------------------------------------
// Tests: runOrchestration
// ---------------------------------------------------------------------------

describe("runOrchestration", () => {
  it("should return undefined when decomposer returns null", async () => {
    const result = await runOrchestration({
      task: "build a web app",
      decision: mockDecision,
      decomposer: createMockDecomposer(null),
    });
    expect(result).toBeUndefined();
  });

  it("should execute plan → execute → merge flow", async () => {
    const decomposition: DecompositionResult = {
      subtasks: [
        { id: "t1", task: "Research React best practices", role: "researcher", dependsOn: [] },
        { id: "t2", task: "Design component architecture", role: "architect", dependsOn: [] },
      ],
      mergeStrategy: "concatenate",
    };

    const result = await runOrchestration({
      task: "build a React app",
      decision: mockDecision,
      decomposer: createMockDecomposer(decomposition),
      stepExecutor: createMockExecutor(),
      timeBudgetMs: 10_000,
    });

    expect(result).toBeDefined();
    expect(result!.subtaskCount).toBe(2);
    expect(result!.mergeStrategy).toBe("concatenate");
    expect(result!.text).toBeTruthy();
    expect(result!.timedOut).toBe(false);
  });

  it("should handle dependent subtasks (sequential waves)", async () => {
    const decomposition: DecompositionResult = {
      subtasks: [
        { id: "t1", task: "Gather requirements", role: "analyst", dependsOn: [] },
        { id: "t2", task: "Implement based on requirements", role: "developer", dependsOn: ["t1"] },
      ],
      mergeStrategy: "concatenate",
    };

    const executionOrder: string[] = [];
    const executor: StepExecutor = async (params) => {
      executionOrder.push(params.userPrompt);
      return `Done: ${params.userPrompt}`;
    };

    const result = await runOrchestration({
      task: "build feature",
      decision: mockDecision,
      decomposer: createMockDecomposer(decomposition),
      stepExecutor: executor,
      timeBudgetMs: 10_000,
    });

    expect(result).toBeDefined();
    expect(result!.subtaskCount).toBe(2);
    // t1 should execute before t2
    expect(executionOrder.indexOf("Gather requirements")).toBeLessThan(
      executionOrder.indexOf("Implement based on requirements"),
    );
  });

  it("should limit subtasks to MAX_WORKERS (4)", async () => {
    const decomposition: DecompositionResult = {
      subtasks: [
        { id: "t1", task: "task1", role: "w", dependsOn: [] },
        { id: "t2", task: "task2", role: "w", dependsOn: [] },
        { id: "t3", task: "task3", role: "w", dependsOn: [] },
        { id: "t4", task: "task4", role: "w", dependsOn: [] },
        { id: "t5", task: "task5", role: "w", dependsOn: [] },
        { id: "t6", task: "task6", role: "w", dependsOn: [] },
      ],
      mergeStrategy: "vote",
    };

    const result = await runOrchestration({
      task: "big task",
      decision: mockDecision,
      decomposer: createMockDecomposer(decomposition),
      stepExecutor: createMockExecutor(),
      timeBudgetMs: 10_000,
    });

    expect(result).toBeDefined();
    expect(result!.subtaskCount).toBeLessThanOrEqual(4);
  });

  it("should return undefined when all workers fail", async () => {
    const decomposition: DecompositionResult = {
      subtasks: [
        { id: "t1", task: "task1", role: "w", dependsOn: [] },
        { id: "t2", task: "task2", role: "w", dependsOn: [] },
      ],
      mergeStrategy: "concatenate",
    };

    // Executor that always throws
    const failingExecutor: StepExecutor = async () => {
      throw new Error("LLM unavailable");
    };

    const result = await runOrchestration({
      task: "failing task",
      decision: mockDecision,
      decomposer: createMockDecomposer(decomposition),
      stepExecutor: failingExecutor,
      timeBudgetMs: 10_000,
    });

    // All workers fail → undefined
    expect(result).toBeUndefined();
  });

  it("should use default decomposer (returns null) when not provided", async () => {
    const result = await runOrchestration({
      task: "test task",
      decision: mockDecision,
    });
    expect(result).toBeUndefined();
  });

  it("should respect abort signal", async () => {
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const decomposition: DecompositionResult = {
      subtasks: [{ id: "t1", task: "task1", role: "w", dependsOn: [] }],
      mergeStrategy: "concatenate",
    };

    const result = await runOrchestration({
      task: "aborted task",
      decision: mockDecision,
      decomposer: createMockDecomposer(decomposition),
      stepExecutor: createMockExecutor(),
      signal: controller.signal,
      timeBudgetMs: 10_000,
    });

    // Should either time out or return undefined
    if (result) {
      expect(result.timedOut).toBe(true);
    }
  });
});
