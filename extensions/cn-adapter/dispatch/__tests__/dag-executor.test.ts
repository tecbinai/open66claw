import { describe, it, expect, vi } from "vitest";
import { topologicalWaves, executeDag } from "../dag-executor.js";
import type { DagNode } from "../dag-executor.js";
import { createWorkspace } from "../execution-workspace.js";
import type { StepRunnerFn, WorkerResult } from "../types.js";

// ---------------------------------------------------------------------------
// Helper: mock step runner
// ---------------------------------------------------------------------------

function createMockRunner(outputs?: Record<string, string>): StepRunnerFn {
  return async (params): Promise<WorkerResult> => {
    const output = outputs?.[params.node.id] ?? `Result for ${params.node.id}`;
    return {
      taskId: params.node.id,
      task: params.node.task,
      output,
      status: "ok",
      durationMs: 10,
    };
  };
}

// ---------------------------------------------------------------------------
// Tests: topologicalWaves
// ---------------------------------------------------------------------------

describe("topologicalWaves", () => {
  it("should return empty array for empty input", () => {
    expect(topologicalWaves([])).toEqual([]);
  });

  it("should put independent nodes in a single wave", () => {
    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: [] },
      { id: "b", task: "task-b", role: "worker", dependsOn: [] },
      { id: "c", task: "task-c", role: "worker", dependsOn: [] },
    ];
    const waves = topologicalWaves(nodes);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(3);
  });

  it("should sort linear dependencies into sequential waves", () => {
    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: [] },
      { id: "b", task: "task-b", role: "worker", dependsOn: ["a"] },
      { id: "c", task: "task-c", role: "worker", dependsOn: ["b"] },
    ];
    const waves = topologicalWaves(nodes);
    expect(waves).toHaveLength(3);
    expect(waves[0]!.map((n) => n.id)).toEqual(["a"]);
    expect(waves[1]!.map((n) => n.id)).toEqual(["b"]);
    expect(waves[2]!.map((n) => n.id)).toEqual(["c"]);
  });

  it("should handle diamond dependency pattern", () => {
    // a → b, a → c, b → d, c → d
    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: [] },
      { id: "b", task: "task-b", role: "worker", dependsOn: ["a"] },
      { id: "c", task: "task-c", role: "worker", dependsOn: ["a"] },
      { id: "d", task: "task-d", role: "worker", dependsOn: ["b", "c"] },
    ];
    const waves = topologicalWaves(nodes);
    expect(waves).toHaveLength(3);
    expect(waves[0]!.map((n) => n.id)).toEqual(["a"]);
    // b and c should be in the same wave (parallel)
    const wave1Ids = waves[1]!.map((n) => n.id).sort();
    expect(wave1Ids).toEqual(["b", "c"]);
    expect(waves[2]!.map((n) => n.id)).toEqual(["d"]);
  });

  it("should handle cycle by forcing remaining nodes into final wave", () => {
    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: ["b"] },
      { id: "b", task: "task-b", role: "worker", dependsOn: ["a"] },
    ];
    const waves = topologicalWaves(nodes);
    // Should have 1 wave with both nodes (forced due to cycle)
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(2);
  });

  it("should ignore dependencies on unknown nodes", () => {
    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: ["unknown"] },
      { id: "b", task: "task-b", role: "worker", dependsOn: [] },
    ];
    const waves = topologicalWaves(nodes);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: executeDag
// ---------------------------------------------------------------------------

describe("executeDag", () => {
  it("should return empty result for empty nodes", async () => {
    const workspace = createWorkspace();
    const result = await executeDag([], {
      timeBudgetMs: 10_000,
      maxParallelism: 4,
      originalTask: "test",
      workspace,
      runStep: createMockRunner(),
    });
    expect(result.results.size).toBe(0);
    expect(result.skippedSteps).toHaveLength(0);
    expect(result.timedOut).toBe(false);
  });

  it("should execute all independent nodes in parallel", async () => {
    const workspace = createWorkspace();
    const runner = vi.fn(
      createMockRunner({
        a: "output-a",
        b: "output-b",
      }),
    );

    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "researcher", dependsOn: [] },
      { id: "b", task: "task-b", role: "analyst", dependsOn: [] },
    ];

    const result = await executeDag(nodes, {
      timeBudgetMs: 10_000,
      maxParallelism: 4,
      originalTask: "test task",
      workspace,
      runStep: runner,
    });

    expect(result.results.size).toBe(2);
    expect(result.results.get("a")!.output).toBe("output-a");
    expect(result.results.get("b")!.output).toBe("output-b");
    expect(result.timedOut).toBe(false);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("should pass dependency context to dependent nodes", async () => {
    const workspace = createWorkspace();
    const capturedContexts: Record<string, string> = {};

    const runner: StepRunnerFn = async (params) => {
      capturedContexts[params.node.id] = params.dependencyContext;
      return {
        taskId: params.node.id,
        task: params.node.task,
        output: `Result from ${params.node.id}`,
        status: "ok",
        durationMs: 5,
      };
    };

    const nodes: DagNode[] = [
      { id: "a", task: "research", role: "researcher", dependsOn: [] },
      { id: "b", task: "analyze", role: "analyst", dependsOn: ["a"] },
    ];

    await executeDag(nodes, {
      timeBudgetMs: 10_000,
      maxParallelism: 4,
      originalTask: "test",
      workspace,
      runStep: runner,
    });

    // Node a should have no dependency context
    expect(capturedContexts["a"]).toBe("");
    // Node b should have context from a
    expect(capturedContexts["b"]).toContain("[Step a]");
    expect(capturedContexts["b"]).toContain("Result from a");
  });

  it("should skip nodes when condition is not met", async () => {
    const workspace = createWorkspace();
    const runner = createMockRunner({ a: "success" });

    const nodes: DagNode[] = [
      { id: "a", task: "task-a", role: "worker", dependsOn: [] },
      {
        id: "b",
        task: "task-b",
        role: "worker",
        dependsOn: ["a"],
        condition: { stepId: "a", field: "status", expect: "error" },
      },
    ];

    const result = await executeDag(nodes, {
      timeBudgetMs: 10_000,
      maxParallelism: 4,
      originalTask: "test",
      workspace,
      runStep: runner,
    });

    expect(result.results.size).toBe(1);
    expect(result.skippedSteps).toContain("b");
  });

  it("should respect maxParallelism", async () => {
    const workspace = createWorkspace();
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const runner: StepRunnerFn = async (params) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 50));
      currentConcurrent--;
      return {
        taskId: params.node.id,
        task: params.node.task,
        output: "done",
        status: "ok",
        durationMs: 50,
      };
    };

    const nodes: DagNode[] = [
      { id: "a", task: "t", role: "w", dependsOn: [] },
      { id: "b", task: "t", role: "w", dependsOn: [] },
      { id: "c", task: "t", role: "w", dependsOn: [] },
      { id: "d", task: "t", role: "w", dependsOn: [] },
    ];

    await executeDag(nodes, {
      timeBudgetMs: 10_000,
      maxParallelism: 2,
      originalTask: "test",
      workspace,
      runStep: runner,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("should time out when budget is exceeded", async () => {
    const workspace = createWorkspace();
    const runner: StepRunnerFn = async (params) => {
      await new Promise((r) => setTimeout(r, 200));
      return {
        taskId: params.node.id,
        task: params.node.task,
        output: "done",
        status: "ok",
        durationMs: 200,
      };
    };

    const nodes: DagNode[] = [
      { id: "a", task: "t", role: "w", dependsOn: [] },
      { id: "b", task: "t", role: "w", dependsOn: ["a"] },
      { id: "c", task: "t", role: "w", dependsOn: ["b"] },
    ];

    const result = await executeDag(nodes, {
      timeBudgetMs: 100, // Very tight budget
      maxParallelism: 4,
      originalTask: "test",
      workspace,
      runStep: runner,
    });

    // Should time out before completing all waves
    expect(result.results.size).toBeLessThan(3);
    expect(result.timedOut).toBe(true);
  });
});
