import { describe, expect, it } from "vitest";
import {
  createInitialMemberStats,
  recordMemberCall,
  computeAverageDuration,
} from "../member-stats.js";

describe("member-stats", () => {
  describe("createInitialMemberStats", () => {
    it("creates stats with zero counts", () => {
      const stats = createInitialMemberStats("agent-a");
      expect(stats.agentId).toBe("agent-a");
      expect(stats.callCount).toBe(0);
      expect(stats.totalDurationMs).toBe(0);
      expect(stats.lastCallAt).toBeUndefined();
    });
  });

  describe("recordMemberCall", () => {
    it("increments callCount and accumulates duration", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, 1000);
      expect(stats.callCount).toBe(1);
      expect(stats.totalDurationMs).toBe(1000);
      expect(stats.lastCallAt).toBeDefined();

      stats = recordMemberCall(stats, 2000);
      expect(stats.callCount).toBe(2);
      expect(stats.totalDurationMs).toBe(3000);
    });

    it("handles undefined duration", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, undefined);
      expect(stats.callCount).toBe(1);
      expect(stats.totalDurationMs).toBe(0);
    });

    it("clamps negative duration to zero", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, -500);
      expect(stats.callCount).toBe(1);
      expect(stats.totalDurationMs).toBe(0);
    });

    it("is immutable — does not modify original", () => {
      const original = createInitialMemberStats("agent-a");
      const updated = recordMemberCall(original, 1000);
      expect(original.callCount).toBe(0);
      expect(updated.callCount).toBe(1);
    });

    it("sets lastCallAt on each call", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, 100);
      const first = stats.lastCallAt;
      expect(first).toBeDefined();

      stats = recordMemberCall(stats, 200);
      expect(stats.lastCallAt).toBeDefined();
    });
  });

  describe("computeAverageDuration", () => {
    it("returns 0 for zero calls", () => {
      const stats = createInitialMemberStats("agent-a");
      expect(computeAverageDuration(stats)).toBe(0);
    });

    it("computes correct average", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, 1000);
      stats = recordMemberCall(stats, 3000);
      expect(computeAverageDuration(stats)).toBe(2000);
    });

    it("rounds to integer (exact division)", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, 1000);
      stats = recordMemberCall(stats, 2000);
      stats = recordMemberCall(stats, 3000);
      // (1000 + 2000 + 3000) / 3 = 2000
      expect(computeAverageDuration(stats)).toBe(2000);
    });

    it("rounds to nearest integer (fractional result)", () => {
      let stats = createInitialMemberStats("agent-a");
      stats = recordMemberCall(stats, 1000);
      stats = recordMemberCall(stats, 2000);
      // (1000 + 2000) / 2 = 1500 — exact, try 3 calls with non-divisible total
      stats = recordMemberCall(stats, 1000);
      // (1000 + 2000 + 1000) / 3 = 1333.333... → 1333
      expect(computeAverageDuration(stats)).toBe(1333);
    });
  });
});
