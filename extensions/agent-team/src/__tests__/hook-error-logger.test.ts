/**
 * Hook Error Logger — unit tests
 *
 * Tests the dedup + suppression-counting behavior of createHookErrorLogger.
 * These tests ensure the log-explosion prevention introduced in the
 * hook crash-guard patch behaves correctly under all conditions.
 *
 * Coverage:
 *  1. First occurrence → error logged with full detail
 *  2. Duplicate within TTL → silently suppressed (no log)
 *  3. Summary warn fires every summaryInterval suppressions
 *  4. TTL expiry resets dedup window (error logged again)
 *  5. Different error classes on same hook → independent windows
 *  6. Different hooks with same error class → independent windows
 *  7. Non-Error thrown values (strings, objects) handled gracefully
 *  8. extra parameter appended to first-occurrence error message
 *  9. suppressCount accessor returns correct counts
 * 10. summaryInterval=1 → warn on every suppression
 * 11. Large burst: only 1 error + N/interval warns (no extra logs)
 * 12. maxSize eviction: oldest key evicted, evicted key treated as new
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createHookErrorLogger } from "../hook-error-logger.js";

// ── Test helpers ────────────────────────────────────────────────────────────

type LogEntry = { level: "error" | "warn"; msg: string };

function makeLogger() {
  const calls: LogEntry[] = [];
  return {
    error: (msg: string) => calls.push({ level: "error", msg }),
    warn: (msg: string) => calls.push({ level: "warn", msg }),
    calls,
    errors: () => calls.filter((c) => c.level === "error"),
    warns: () => calls.filter((c) => c.level === "warn"),
    reset: () => {
      calls.length = 0;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createHookErrorLogger", () => {
  describe("1. first occurrence", () => {
    it("logs a full error on first occurrence", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", new TypeError("bad token"));

      expect(log.errors()).toHaveLength(1);
      expect(log.errors()[0].msg).toContain("[resolve_agent]");
      expect(log.errors()[0].msg).toContain("[TypeError]");
      expect(log.errors()[0].msg).toContain("bad token");
      expect(log.warns()).toHaveLength(0);
    });

    it("includes extra parameter in first-occurrence message", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("agent_end", new Error("oops"), ` for agent "weather-01"`);

      expect(log.errors()[0].msg).toContain(`for agent "weather-01"`);
    });
  });

  describe("2. suppression within TTL", () => {
    it("silently suppresses duplicate errors within TTL (no log output)", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", new TypeError("bad token")); // logged
      log.reset();

      // 9 more occurrences: all suppressed, none reach summaryInterval=10
      for (let i = 0; i < 9; i++) {
        hl.log("resolve_agent", new TypeError("bad token"));
      }

      expect(log.calls).toHaveLength(0);
    });

    it("suppressCount increments on each suppression", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("before_agent_start", new RangeError("overflow")); // first
      hl.log("before_agent_start", new RangeError("overflow")); // suppressed ×1
      hl.log("before_agent_start", new RangeError("overflow")); // suppressed ×2

      expect(hl.suppressCount("before_agent_start", "RangeError")).toBe(2);
    });
  });

  describe("3. summary warn fires at summaryInterval", () => {
    it("emits a warn summary at every summaryInterval suppressions", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 5 });

      hl.log("message_sending", new Error("net timeout")); // first → error
      log.reset();

      // 5 more: 5th should trigger warn
      for (let i = 0; i < 5; i++) {
        hl.log("message_sending", new Error("net timeout"));
      }

      expect(log.warns()).toHaveLength(1);
      expect(log.errors()).toHaveLength(0);
      const w = log.warns()[0].msg;
      expect(w).toContain("[message_sending]");
      expect(w).toContain("suppressed 5x");
      expect(w).toContain("Error");
    });

    it("emits warn at every multiple of summaryInterval", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 3 });

      hl.log("agent_end", new Error("db error")); // first → error
      log.reset();

      // 9 more: warns at hits 3, 6, 9
      for (let i = 0; i < 9; i++) {
        hl.log("agent_end", new Error("db error"));
      }

      expect(log.warns()).toHaveLength(3);
      expect(log.errors()).toHaveLength(0);
      expect(log.warns()[0].msg).toContain("suppressed 3x");
      expect(log.warns()[1].msg).toContain("suppressed 6x");
      expect(log.warns()[2].msg).toContain("suppressed 9x");
    });

    it("summaryInterval=1 warns on every suppression", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 1 });

      hl.log("resolve_agent", new Error("e")); // first → error
      log.reset();

      for (let i = 0; i < 4; i++) {
        hl.log("resolve_agent", new Error("e"));
      }

      expect(log.warns()).toHaveLength(4);
      expect(log.errors()).toHaveLength(0);
    });
  });

  describe("4. TTL expiry resets dedup", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("treats the error as new after TTL expires (fake timers)", () => {
      vi.useFakeTimers();
      const log = makeLogger();
      // 1s TTL so we can advance fake clock precisely
      const hl = createHookErrorLogger(log, { ttlMs: 1_000, summaryInterval: 10 });

      // t=0: first occurrence → error
      hl.log("resolve_agent", new TypeError("x"));
      expect(log.errors()).toHaveLength(1);
      log.reset();

      // t=0: duplicate → suppressed
      hl.log("resolve_agent", new TypeError("x"));
      expect(log.calls).toHaveLength(0);

      // Advance time past TTL
      vi.advanceTimersByTime(1_001);

      // t=1001ms: TTL expired → treated as new → error again
      hl.log("resolve_agent", new TypeError("x"));
      expect(log.errors()).toHaveLength(1);
      expect(log.warns()).toHaveLength(0);
    });

    it("does not reset before TTL expires", () => {
      vi.useFakeTimers();
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 5_000, summaryInterval: 10 });

      hl.log("resolve_agent", new Error("e")); // first
      vi.advanceTimersByTime(4_999); // not yet expired
      log.reset();

      hl.log("resolve_agent", new Error("e")); // still within TTL → suppressed
      expect(log.calls).toHaveLength(0);
    });
  });

  describe("5. different error classes on same hook → independent windows", () => {
    it("does not cross-suppress different error types on the same hook", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("agent_end", new TypeError("type err"));
      hl.log("agent_end", new RangeError("range err"));
      hl.log("agent_end", new URIError("uri err"));

      // All three distinct error classes → 3 separate error logs
      expect(log.errors()).toHaveLength(3);
    });

    it("suppresses only the matching error class, not others", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("agent_end", new TypeError("type err")); // logged
      hl.log("agent_end", new TypeError("type err 2")); // suppressed (same class)
      hl.log("agent_end", new RangeError("range err")); // logged (different class)

      expect(log.errors()).toHaveLength(2);
      const msgs = log.errors().map((e) => e.msg);
      expect(msgs.some((m) => m.includes("TypeError"))).toBe(true);
      expect(msgs.some((m) => m.includes("RangeError"))).toBe(true);
    });
  });

  describe("6. different hooks with same error class → independent windows", () => {
    it("does not cross-suppress the same error class across different hooks", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", new TypeError("net error"));
      hl.log("before_agent_start", new TypeError("net error"));
      hl.log("agent_end", new TypeError("net error"));
      hl.log("message_sending", new TypeError("net error"));

      // 4 different hooks → 4 independent dedup keys → 4 error logs
      expect(log.errors()).toHaveLength(4);
    });

    it("suppressCount is tracked independently per hook", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", new Error("e")); // first
      hl.log("resolve_agent", new Error("e")); // suppress ×1
      hl.log("resolve_agent", new Error("e")); // suppress ×2

      hl.log("agent_end", new Error("e")); // first (different hook)
      hl.log("agent_end", new Error("e")); // suppress ×1

      expect(hl.suppressCount("resolve_agent", "Error")).toBe(2);
      expect(hl.suppressCount("agent_end", "Error")).toBe(1);
    });
  });

  describe("7. non-Error thrown values", () => {
    it("handles thrown string gracefully", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", "something went wrong");

      expect(log.errors()).toHaveLength(1);
      // non-Error: errClass = typeof → "string"
      expect(log.errors()[0].msg).toContain("[string]");
      expect(log.errors()[0].msg).toContain("something went wrong");
    });

    it("handles thrown number", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("agent_end", 42);

      expect(log.errors()[0].msg).toContain("[number]");
      expect(log.errors()[0].msg).toContain("42");
    });

    it("handles thrown null", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("message_sending", null);

      expect(log.errors()).toHaveLength(1);
      expect(log.errors()[0].msg).toContain("[object]");
    });

    it("handles thrown plain object", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      hl.log("resolve_agent", { code: 503 });

      expect(log.errors()).toHaveLength(1);
      expect(log.errors()[0].msg).toContain("[object]");
    });

    it("handles Error subclass with custom name", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      class CustomAuthError extends Error {
        constructor(msg: string) {
          super(msg);
          this.name = "CustomAuthError";
        }
      }

      hl.log("before_agent_start", new CustomAuthError("token expired"));

      expect(log.errors()[0].msg).toContain("[CustomAuthError]");
      expect(log.errors()[0].msg).toContain("token expired");
    });
  });

  describe("8. large burst test", () => {
    it("1 error + correct number of warns for 100-burst with interval=10", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      for (let i = 0; i < 101; i++) {
        hl.log("resolve_agent", new Error("db conn refused"));
      }

      // 1st call → error; calls 2-101 → 100 suppressions → 10 warns (at 10,20,...,100)
      expect(log.errors()).toHaveLength(1);
      expect(log.warns()).toHaveLength(10);
      expect(hl.suppressCount("resolve_agent", "Error")).toBe(100);
    });

    it("warn messages contain ascending suppression counts", () => {
      const log = makeLogger();
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

      for (let i = 0; i < 31; i++) {
        hl.log("agent_end", new Error("timeout"));
      }
      // 1 error + 3 warns at 10, 20, 30
      expect(log.warns()).toHaveLength(3);
      expect(log.warns()[0].msg).toContain("suppressed 10x");
      expect(log.warns()[1].msg).toContain("suppressed 20x");
      expect(log.warns()[2].msg).toContain("suppressed 30x");
    });
  });

  describe("9. maxSize eviction", () => {
    it("evicted key is treated as new on next occurrence", () => {
      const log = makeLogger();
      // maxSize=2: only 2 keys tracked simultaneously
      const hl = createHookErrorLogger(log, { ttlMs: 60_000, maxSize: 2, summaryInterval: 10 });

      hl.log("resolve_agent", new TypeError("type")); // key A, logged
      hl.log("resolve_agent", new RangeError("range")); // key B, logged
      hl.log("resolve_agent", new URIError("uri")); // key C, logged — evicts A (LRU)
      log.reset();

      // key A (TypeError) was evicted → next occurrence is treated as new
      hl.log("resolve_agent", new TypeError("type"));

      expect(log.errors()).toHaveLength(1);
      expect(log.errors()[0].msg).toContain("TypeError");
    });
  });

  describe("10. real-world hook names", () => {
    const hooks = ["resolve_agent", "before_agent_start", "agent_end", "message_sending"] as const;

    for (const hook of hooks) {
      it(`[${hook}] logs error with hook name in message`, () => {
        const log = makeLogger();
        const hl = createHookErrorLogger(log, { ttlMs: 60_000, summaryInterval: 10 });

        hl.log(hook, new Error("test error"));

        expect(log.errors()).toHaveLength(1);
        expect(log.errors()[0].msg).toContain(`[${hook}]`);
      });
    }
  });
});
