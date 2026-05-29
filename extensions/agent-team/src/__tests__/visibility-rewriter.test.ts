import { describe, expect, it } from "vitest";
import { rewriteOutboundMessage } from "../visibility-rewriter.js";
import { makeProject } from "./test-helpers.js";

describe("visibility-rewriter", () => {
  describe("unified mode", () => {
    const project = makeProject({
      visibility: { mode: "unified", displayName: "SmartBot" },
    });

    it("passes content through unchanged", () => {
      const result = rewriteOutboundMessage({
        content: "Hello, how can I help?",
        project,
        agentId: "agent-a",
      });
      expect(result.content).toBe("Hello, how can I help?");
    });

    it("does not add any prefix", () => {
      const result = rewriteOutboundMessage({
        content: "Some response",
        project,
        agentId: "supervisor",
      });
      expect(result.content).not.toContain("[");
    });
  });

  describe("team mode", () => {
    it("prefixes with displayName when set", () => {
      const project = makeProject({
        visibility: { mode: "team", displayName: "HelpDesk" },
      });
      const result = rewriteOutboundMessage({
        content: "Hello!",
        project,
        agentId: "agent-a",
      });
      expect(result.content).toBe("[HelpDesk] Hello!");
    });

    it("no prefix when displayName is not set", () => {
      const project = makeProject({ visibility: { mode: "team" } });
      const result = rewriteOutboundMessage({
        content: "Hello!",
        project,
        agentId: "agent-a",
      });
      expect(result.content).toBe("Hello!");
    });
  });

  describe("transparent mode", () => {
    const project = makeProject({ visibility: { mode: "transparent" } });

    it("prefixes with [@memberName] for known agent", () => {
      const result = rewriteOutboundMessage({
        content: "Here's the answer.",
        project,
        agentId: "agent-a",
      });
      expect(result.content).toBe("[@Alice] Here's the answer.");
    });

    it("prefixes with [@agentId] for unknown agent", () => {
      const result = rewriteOutboundMessage({
        content: "Fallback message",
        project,
        agentId: "unknown-agent",
      });
      expect(result.content).toBe("[@unknown-agent] Fallback message");
    });

    it("prefixes supervisor messages too", () => {
      const result = rewriteOutboundMessage({
        content: "Routing you now.",
        project,
        agentId: "supervisor",
      });
      expect(result.content).toBe("[@Supervisor] Routing you now.");
    });
  });

  describe("edge cases", () => {
    it("returns empty content as-is", () => {
      const project = makeProject({ visibility: { mode: "transparent" } });
      const result = rewriteOutboundMessage({
        content: "",
        project,
        agentId: "agent-a",
      });
      expect(result.content).toBe("");
    });

    it("does not set cancel flag by default", () => {
      const project = makeProject();
      const result = rewriteOutboundMessage({
        content: "test",
        project,
        agentId: "agent-a",
      });
      expect(result.cancel).toBeUndefined();
    });
  });
});
