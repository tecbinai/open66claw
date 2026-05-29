import { describe, expect, it } from "vitest";
import { buildTeamContextBlock, isSupervisor, isTeamMember } from "../system-prompt.js";
import { makeProject } from "./test-helpers.js";

describe("system-prompt", () => {
  describe("isTeamMember / isSupervisor", () => {
    it("identifies team members", () => {
      const p = makeProject();
      expect(isTeamMember(p, "supervisor")).toBe(true);
      expect(isTeamMember(p, "agent-a")).toBe(true);
      expect(isTeamMember(p, "unknown")).toBe(false);
    });

    it("identifies supervisor", () => {
      const p = makeProject();
      expect(isSupervisor(p, "supervisor")).toBe(true);
      expect(isSupervisor(p, "agent-a")).toBe(false);
    });
  });

  describe("team mode (default)", () => {
    it("supervisor context includes team name and members", () => {
      const ctx = buildTeamContextBlock(makeProject(), "supervisor");
      expect(ctx).toContain('role="supervisor"');
      expect(ctx).toContain('Supervisor of team "Test Team"');
      expect(ctx).toContain("Alice (@agent-a)");
      expect(ctx).toContain("Bob (@agent-b)");
      expect(ctx).toContain("Operating rules:");
    });

    it("member context includes team name and teammates", () => {
      const ctx = buildTeamContextBlock(makeProject(), "agent-a");
      expect(ctx).toContain('role="member"');
      expect(ctx).toContain('"Alice", a member of team "Test Team"');
      expect(ctx).toContain("Your supervisor is @supervisor");
      expect(ctx).toContain("Bob (@agent-b)");
    });

    it("returns empty string for non-member", () => {
      expect(buildTeamContextBlock(makeProject(), "outsider")).toBe("");
    });
  });

  describe("unified mode", () => {
    const project = makeProject({
      visibility: { mode: "unified", displayName: "SmartBot" },
    });

    it("supervisor context uses displayName, hides team", () => {
      const ctx = buildTeamContextBlock(project, "supervisor");
      expect(ctx).toContain('You are "SmartBot"');
      expect(ctx).toContain("single, seamless assistant");
      expect(ctx).toContain("Never reveal you are a team");
      // Still includes routing table for internal routing
      expect(ctx).toContain("Routing Table");
      // Does NOT include "Supervisor of team"
      expect(ctx).not.toContain("Supervisor of team");
    });

    it("member context uses displayName, hides teammates", () => {
      const ctx = buildTeamContextBlock(project, "agent-a");
      expect(ctx).toContain('You are "SmartBot"');
      expect(ctx).toContain("sole assistant");
      expect(ctx).toContain("Never mention teammates");
      // Does NOT list teammates
      expect(ctx).not.toContain("Your teammates:");
      expect(ctx).not.toContain("Bob");
    });

    it("falls back to project name if no displayName", () => {
      const p = makeProject({ visibility: { mode: "unified" } });
      const ctx = buildTeamContextBlock(p, "agent-a");
      expect(ctx).toContain('You are "Test Team"');
    });
  });

  describe("transparent mode", () => {
    const project = makeProject({ visibility: { mode: "transparent" } });

    it("supervisor context shows team identity (same as team mode)", () => {
      const ctx = buildTeamContextBlock(project, "supervisor");
      expect(ctx).toContain('Supervisor of team "Test Team"');
      expect(ctx).toContain("Team members:");
    });

    it("member context shows individual identity without team branding", () => {
      const ctx = buildTeamContextBlock(project, "agent-a");
      expect(ctx).toContain('You are "Alice"');
      expect(ctx).toContain("Your role: Customer Support");
      // Lists teammates
      expect(ctx).toContain("Your teammates:");
      expect(ctx).toContain("Bob");
      // Does NOT say "member of team"
      expect(ctx).not.toContain("member of team");
    });
  });

  describe("shared memory hint", () => {
    it("appears for supervisor in read-shared mode", () => {
      const p = makeProject({ memory: { mode: "read-shared" } });
      const ctx = buildTeamContextBlock(p, "supervisor");
      expect(ctx).toContain("memory_share");
    });

    it("appears for member in read-shared mode", () => {
      const p = makeProject({ memory: { mode: "read-shared" } });
      const ctx = buildTeamContextBlock(p, "agent-a");
      expect(ctx).toContain("memory_share");
    });

    it("absent in isolated mode", () => {
      const p = makeProject({ memory: { mode: "isolated" } });
      const ctx = buildTeamContextBlock(p, "agent-a");
      expect(ctx).not.toContain("memory_share");
    });

    it("appears in unified mode with read-shared", () => {
      const p = makeProject({
        visibility: { mode: "unified", displayName: "Bot" },
        memory: { mode: "read-shared" },
      });
      const ctx = buildTeamContextBlock(p, "agent-a");
      expect(ctx).toContain("memory_share");
    });
  });

  describe("brand constraints", () => {
    it("included for all visibility modes", () => {
      for (const mode of ["unified", "team", "transparent"] as const) {
        const p = makeProject({
          visibility: { mode },
          constraints: { brandRules: { userAddress: "Dear customer" } },
        });
        const ctx = buildTeamContextBlock(p, "agent-a");
        expect(ctx).toContain("Dear customer");
      }
    });
  });
});
