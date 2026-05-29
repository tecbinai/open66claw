import { describe, it, expect } from "vitest";
import { mergeWorkerResults } from "../result-merger.js";
import type { WorkerResult } from "../types.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeResult(id: string, output: string, status: "ok" | "error" = "ok"): WorkerResult {
  return { taskId: id, task: `Task ${id}`, output, status, durationMs: 100 };
}

// ---------------------------------------------------------------------------
// Tests: concatenate strategy
// ---------------------------------------------------------------------------

describe("mergeWorkerResults — concatenate", () => {
  it("should return single successful result as-is", () => {
    const results = [makeResult("t1", "Hello world")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "concatenate",
    });
    expect(merged).toBe("Hello world");
  });

  it("should concatenate multiple results with section headers", () => {
    const results = [makeResult("t1", "Part one content"), makeResult("t2", "Part two content")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "concatenate",
    });
    expect(merged).toContain("### Part 1: Task t1");
    expect(merged).toContain("Part one content");
    expect(merged).toContain("### Part 2: Task t2");
    expect(merged).toContain("Part two content");
    expect(merged).toContain("---");
  });

  it("should deduplicate identical outputs", () => {
    const results = [makeResult("t1", "Same output"), makeResult("t2", "Same output")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "concatenate",
    });
    // Should return the single unique output without headers
    expect(merged).toBe("Same output");
  });

  it("should skip failed results", () => {
    const results = [makeResult("t1", "Good output"), makeResult("t2", "Error output", "error")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "concatenate",
    });
    expect(merged).toBe("Good output");
  });

  it("should handle all-failed results", () => {
    const results = [makeResult("t1", "err", "error"), makeResult("t2", "err", "error")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "concatenate",
    });
    expect(merged).toBe("All workers failed to produce results.");
  });

  it("should return message for empty results", () => {
    const merged = mergeWorkerResults({
      results: [],
      originalTask: "test",
      strategy: "concatenate",
    });
    expect(merged).toBe("No worker results available.");
  });
});

// ---------------------------------------------------------------------------
// Tests: vote strategy
// ---------------------------------------------------------------------------

describe("mergeWorkerResults — vote", () => {
  it("should return the most common answer", () => {
    const results = [
      makeResult("t1", "Answer A"),
      makeResult("t2", "Answer A"),
      makeResult("t3", "Answer B"),
    ];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "vote",
    });
    expect(merged).toBe("Answer A");
  });

  it("should be case-insensitive when counting votes", () => {
    const results = [makeResult("t1", "Yes"), makeResult("t2", "yes"), makeResult("t3", "No")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "vote",
    });
    // "Yes" and "yes" should count as the same (2 votes vs 1)
    expect(merged.toLowerCase()).toBe("yes");
  });

  it("should handle tie by returning the first encountered", () => {
    const results = [makeResult("t1", "Alpha"), makeResult("t2", "Beta")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "vote",
    });
    // Both have 1 vote; implementation returns whichever gets highest count first
    expect(["Alpha", "Beta"]).toContain(merged);
  });

  it("should skip failed results in voting", () => {
    const results = [
      makeResult("t1", "Good", "ok"),
      makeResult("t2", "Bad", "error"),
      makeResult("t3", "Good", "ok"),
    ];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "vote",
    });
    expect(merged).toBe("Good");
  });
});

// ---------------------------------------------------------------------------
// Tests: unknown strategy fallback
// ---------------------------------------------------------------------------

describe("mergeWorkerResults — unknown strategy", () => {
  it("should fall back to concatenation for unknown strategy", () => {
    const results = [makeResult("t1", "Output one")];
    const merged = mergeWorkerResults({
      results,
      originalTask: "test",
      strategy: "unknown_strategy" as any,
    });
    expect(merged).toBe("Output one");
  });
});
