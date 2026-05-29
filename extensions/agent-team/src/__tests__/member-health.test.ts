import { describe, expect, it } from "vitest";
import {
  createInitialMemberHealth,
  getMemberHealthStatus,
  isRoutable,
  recordMemberFailure,
  recordMemberSuccess,
} from "../member-health.js";

describe("member-health", () => {
  describe("createInitialMemberHealth", () => {
    it("creates healthy state with zero counters", () => {
      const h = createInitialMemberHealth("agent-1");
      expect(h.agentId).toBe("agent-1");
      expect(h.state).toBe("healthy");
      expect(h.consecutiveFailures).toBe(0);
      expect(h.consecutiveSuccesses).toBe(0);
      expect(h.totalFailures).toBe(0);
      expect(h.totalSuccesses).toBe(0);
    });
  });

  describe("state transitions", () => {
    it("healthy → degraded after 2 consecutive failures", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberFailure(h);
      expect(h.state).toBe("healthy"); // 1 failure: still healthy
      h = recordMemberFailure(h);
      expect(h.state).toBe("degraded"); // 2 failures: degraded
    });

    it("degraded → down after 5 consecutive failures", () => {
      let h = createInitialMemberHealth("a");
      // Get to degraded (2 failures)
      h = recordMemberFailure(h);
      h = recordMemberFailure(h);
      expect(h.state).toBe("degraded");

      // 3 more to reach 5 total
      h = recordMemberFailure(h);
      h = recordMemberFailure(h);
      expect(h.state).toBe("degraded"); // 4 failures: still degraded
      h = recordMemberFailure(h);
      expect(h.state).toBe("down"); // 5 failures: down
    });

    it("down → degraded after 1 success", () => {
      let h = createInitialMemberHealth("a");
      // Get to down
      for (let i = 0; i < 5; i++) h = recordMemberFailure(h);
      expect(h.state).toBe("down");

      h = recordMemberSuccess(h);
      expect(h.state).toBe("degraded");
    });

    it("degraded → healthy after 3 consecutive successes", () => {
      let h = createInitialMemberHealth("a");
      // Get to degraded
      h = recordMemberFailure(h);
      h = recordMemberFailure(h);
      expect(h.state).toBe("degraded");

      h = recordMemberSuccess(h);
      expect(h.state).toBe("degraded"); // 1 success
      h = recordMemberSuccess(h);
      expect(h.state).toBe("degraded"); // 2 successes
      h = recordMemberSuccess(h);
      expect(h.state).toBe("healthy"); // 3 successes: recovered
    });

    it("success resets consecutive failure counter", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberFailure(h);
      expect(h.consecutiveFailures).toBe(1);
      h = recordMemberSuccess(h);
      expect(h.consecutiveFailures).toBe(0);
    });

    it("failure resets consecutive success counter", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberSuccess(h);
      h = recordMemberSuccess(h);
      expect(h.consecutiveSuccesses).toBe(2);
      h = recordMemberFailure(h);
      expect(h.consecutiveSuccesses).toBe(0);
    });

    it("records error message on failure", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberFailure(h, "timeout");
      expect(h.lastError).toBe("timeout");
    });

    it("tracks total counts correctly", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberSuccess(h);
      h = recordMemberFailure(h);
      h = recordMemberSuccess(h);
      h = recordMemberSuccess(h);
      expect(h.totalSuccesses).toBe(3);
      expect(h.totalFailures).toBe(1);
    });
  });

  describe("getMemberHealthStatus", () => {
    it("returns current state", () => {
      const h = createInitialMemberHealth("a");
      expect(getMemberHealthStatus(h)).toBe("healthy");
    });
  });

  describe("isRoutable", () => {
    it("returns true for healthy", () => {
      expect(isRoutable(createInitialMemberHealth("a"))).toBe(true);
    });

    it("returns true for degraded", () => {
      let h = createInitialMemberHealth("a");
      h = recordMemberFailure(h);
      h = recordMemberFailure(h);
      expect(h.state).toBe("degraded");
      expect(isRoutable(h)).toBe(true);
    });

    it("returns false for down", () => {
      let h = createInitialMemberHealth("a");
      for (let i = 0; i < 5; i++) h = recordMemberFailure(h);
      expect(h.state).toBe("down");
      expect(isRoutable(h)).toBe(false);
    });
  });
});
