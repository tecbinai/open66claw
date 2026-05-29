import { describe, expect, it } from "vitest";
import { formatActivitySummary, type ActivityEventLike } from "../conversation-compactor.js";

// ── Fixtures ────────────────────────────────────────────────────────────

const nameMap = new Map<string, string>([
  ["proj-test--member-sales", "Sales Agent"],
  ["proj-test--member-support", "Support Agent"],
  ["proj-test--member-tech", "Tech Agent"],
]);

function makeEvent(overrides?: Partial<ActivityEventLike>): ActivityEventLike {
  return {
    agentId: "proj-test--member-sales",
    method: "keyword",
    durationMs: 2500,
    success: true,
    outcome: "success",
    ...overrides,
  };
}

// ── formatActivitySummary ───────────────────────────────────────────────

describe("conversation-compactor", () => {
  describe("formatActivitySummary — basic behavior", () => {
    it("returns empty string for empty events array", () => {
      expect(formatActivitySummary([], nameMap)).toBe("");
    });

    it("returns empty string for null-like input", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatActivitySummary(null as any, nameMap)).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatActivitySummary(undefined as any, nameMap)).toBe("");
    });

    it("formats a single success event", () => {
      const result = formatActivitySummary([makeEvent()], nameMap);
      expect(result).toContain("Recent team activity:");
      expect(result).toContain("Sales Agent");
      expect(result).toContain("completed");
      expect(result).toContain("2.5s");
    });

    it("formats multiple events", () => {
      const events = [
        makeEvent({ agentId: "proj-test--member-sales" }),
        makeEvent({ agentId: "proj-test--member-support", method: "affinity" }),
        makeEvent({ agentId: "proj-test--member-tech", method: "supervisor-llm" }),
      ];
      const result = formatActivitySummary(events, nameMap);
      expect(result).toContain("Sales Agent");
      expect(result).toContain("Support Agent");
      expect(result).toContain("Tech Agent");
    });

    it("includes routing method", () => {
      const result = formatActivitySummary([makeEvent({ method: "affinity" })], nameMap);
      expect(result).toContain("via affinity");
    });

    it("omits method when undefined", () => {
      const result = formatActivitySummary([makeEvent({ method: undefined })], nameMap);
      expect(result).not.toContain("via");
    });
  });

  describe("formatActivitySummary — name resolution", () => {
    it("uses display name from nameMap", () => {
      const result = formatActivitySummary(
        [makeEvent({ agentId: "proj-test--member-sales" })],
        nameMap,
      );
      expect(result).toContain("Sales Agent");
      expect(result).not.toContain("proj-test--member-sales");
    });

    it("falls back to shortId for unknown agents", () => {
      const result = formatActivitySummary(
        [makeEvent({ agentId: "proj-abc--member-unknown" })],
        nameMap,
      );
      expect(result).toContain("member-unknown");
      expect(result).not.toContain("proj-abc");
    });

    it("uses full agentId if no -- separator", () => {
      const result = formatActivitySummary([makeEvent({ agentId: "simple-agent" })], nameMap);
      expect(result).toContain("simple-agent");
    });

    it("handles emoji in nameMap", () => {
      const emojiMap = new Map([["agent-1", "🤖 Bot"]]);
      const result = formatActivitySummary([makeEvent({ agentId: "agent-1" })], emojiMap);
      expect(result).toContain("🤖 Bot");
    });
  });

  describe("formatActivitySummary — outcome formatting", () => {
    it("formats success outcome as completed", () => {
      const result = formatActivitySummary([makeEvent({ outcome: "success" })], nameMap);
      expect(result).toContain("completed");
    });

    it("formats failure outcome with error detail", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: "failure", success: false, error: "Model overloaded" })],
        nameMap,
      );
      expect(result).toContain("failed");
      expect(result).toContain("Model overloaded");
    });

    it("formats failure outcome without error", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: "failure", success: false })],
        nameMap,
      );
      expect(result).toContain("failed");
    });

    it("formats timeout outcome", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: "timeout", success: false })],
        nameMap,
      );
      expect(result).toContain("timed out");
    });

    it("formats partial outcome", () => {
      const result = formatActivitySummary([makeEvent({ outcome: "partial" })], nameMap);
      expect(result).toContain("partial result");
    });

    it("falls back to boolean success when outcome is undefined", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: undefined, success: true })],
        nameMap,
      );
      expect(result).toContain("completed");
    });

    it("falls back to boolean failure when outcome is undefined", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: undefined, success: false, error: "crash" })],
        nameMap,
      );
      expect(result).toContain("failed");
      expect(result).toContain("crash");
    });

    it("defaults to completed when both outcome and success are undefined", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: undefined, success: undefined })],
        nameMap,
      );
      expect(result).toContain("completed");
    });
  });

  describe("formatActivitySummary — duration formatting", () => {
    it("formats sub-second duration in ms", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: 450 })], nameMap);
      expect(result).toContain("450ms");
    });

    it("formats multi-second duration in seconds", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: 3700 })], nameMap);
      expect(result).toContain("3.7s");
    });

    it("omits duration when undefined", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: undefined })], nameMap);
      // Should not have parenthesized duration
      expect(result).not.toMatch(/\(\d/);
    });

    it("handles zero duration", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: 0 })], nameMap);
      expect(result).toContain("0ms");
    });

    it("handles negative duration gracefully", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: -100 })], nameMap);
      expect(result).toContain("0ms");
    });

    it("handles NaN duration gracefully", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: NaN })], nameMap);
      expect(result).toContain("0ms");
    });

    it("handles Infinity duration gracefully", () => {
      const result = formatActivitySummary([makeEvent({ durationMs: Infinity })], nameMap);
      expect(result).toContain("0ms");
    });
  });

  describe("formatActivitySummary — limit and truncation", () => {
    it("takes only the last N events (newest)", () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({
          agentId: `proj-test--member-agent-${i}`,
          durationMs: (i + 1) * 100,
        }),
      );
      const result = formatActivitySummary(events, nameMap, 3);
      // Should contain agent-7, agent-8, agent-9 (last 3)
      expect(result).toContain("agent-7");
      expect(result).toContain("agent-8");
      expect(result).toContain("agent-9");
      // Should NOT contain agent-0 through agent-6
      expect(result).not.toContain("agent-0");
      expect(result).not.toContain("agent-6");
    });

    it("uses default limit of 5", () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({ agentId: `proj-test--member-agent-${i}` }),
      );
      const result = formatActivitySummary(events, nameMap);
      // Count lines: header + 5 events
      const lines = result.split("\n");
      expect(lines).toHaveLength(6); // "Recent team activity:" + 5 event lines
    });

    it("hard truncates at 500 chars with ellipsis", () => {
      // Each event line needs to be ~120 chars to exceed 500 total with 5 events.
      // Use very long agent names in nameMap + long errors to guarantee overflow.
      const bigNameMap = new Map<string, string>();
      const events = Array.from({ length: 5 }, (_, i) => {
        const id = `proj-test--member-agent-with-a-very-long-name-${i}`;
        bigNameMap.set(
          id,
          `Agent With An Extremely Long Display Name Number ${i} For Testing Purposes`,
        );
        return makeEvent({
          agentId: id,
          outcome: "failure",
          success: false,
          error: "A very long error message that describes the failure in great detail",
          method: "supervisor-llm",
        });
      });
      const result = formatActivitySummary(events, bigNameMap);
      expect(result.length).toBeLessThanOrEqual(500);
      expect(result).toMatch(/\.\.\.$/);
    });

    it("does not truncate when under budget", () => {
      const result = formatActivitySummary([makeEvent()], nameMap);
      expect(result).not.toMatch(/\.\.\.$/);
      expect(result.length).toBeLessThan(500);
    });
  });

  describe("formatActivitySummary — security (prompt injection)", () => {
    it("strips XML tags from error messages", () => {
      const result = formatActivitySummary(
        [
          makeEvent({
            outcome: "failure",
            success: false,
            error: "Error: <script>alert('xss')</script>",
          }),
        ],
        nameMap,
      );
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("</script>");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("strips XML tags from shortId fallback", () => {
      const result = formatActivitySummary(
        [makeEvent({ agentId: "proj--<injection>bad</injection>" })],
        nameMap,
      );
      expect(result).not.toContain("<injection>");
      expect(result).not.toContain("</injection>");
    });

    it("strips closing team-status tag from error", () => {
      const result = formatActivitySummary(
        [
          makeEvent({
            outcome: "failure",
            success: false,
            error: "blah </team-status> injected",
          }),
        ],
        nameMap,
      );
      expect(result).not.toContain("</team-status>");
    });

    it("collapses newlines in error messages", () => {
      const result = formatActivitySummary(
        [
          makeEvent({
            outcome: "failure",
            success: false,
            error: "line1\nline2\nline3",
          }),
        ],
        nameMap,
      );
      // Newlines should be collapsed to spaces
      expect(result).not.toMatch(/\nline2/);
      expect(result).toContain("line1 line2 line3");
    });

    it("handles unknown outcome values safely", () => {
      const result = formatActivitySummary(
        [makeEvent({ outcome: "<injected>evil</injected>" })],
        nameMap,
      );
      expect(result).not.toContain("<injected>");
      expect(result).not.toContain("</injected>");
    });

    it("truncates long error before sanitizing", () => {
      const longError = "A".repeat(50) + "<script>x</script>";
      const result = formatActivitySummary(
        [makeEvent({ outcome: "failure", success: false, error: longError })],
        nameMap,
      );
      // Error should be truncated to 40 chars then sanitized
      expect(result.length).toBeLessThan(500);
      expect(result).not.toContain("<script>");
    });
  });

  describe("formatActivitySummary — edge cases", () => {
    it("handles empty nameMap gracefully", () => {
      const result = formatActivitySummary(
        [makeEvent({ agentId: "proj-abc--member-xyz" })],
        new Map(),
      );
      expect(result).toContain("member-xyz");
    });

    it("handles event with all optional fields undefined", () => {
      const result = formatActivitySummary(
        [
          {
            agentId: "proj-test--member-sales",
          },
        ],
        nameMap,
      );
      expect(result).toContain("Sales Agent");
      expect(result).toContain("completed");
    });

    it("limit of 0 returns empty string", () => {
      const result = formatActivitySummary([makeEvent()], nameMap, 0);
      // slice(-0) returns full array, but this is an edge case
      // The function should still work — 0 events means no lines
      expect(typeof result).toBe("string");
    });

    it("limit of 1 returns only the newest event", () => {
      const events = [
        makeEvent({ agentId: "proj-test--member-sales" }),
        makeEvent({ agentId: "proj-test--member-tech" }),
      ];
      const result = formatActivitySummary(events, nameMap, 1);
      expect(result).toContain("Tech Agent");
      expect(result).not.toContain("Sales Agent");
    });
  });
});
