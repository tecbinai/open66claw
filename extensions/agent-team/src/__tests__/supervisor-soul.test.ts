import { describe, expect, it } from "vitest";
import { generateRoutingTable, generateSupervisorSoul } from "../supervisor-soul.js";
import type { MemberInfo, Project } from "../types.js";

// Uses custom makeProject with weather/finance members (not shared fixture)
// because supervisor-soul tests depend on keyword extraction from these roles.
function makeProject(overrides?: Partial<Project>): Project {
  return {
    projectId: "proj-test-001",
    name: "Test Team",
    description: "A test team for unit tests",
    status: "active",
    version: 1,
    createdAt: "2026-02-27T00:00:00Z",
    updatedAt: "2026-02-27T00:00:00Z",
    supervisorId: "supervisor",
    memberIds: ["supervisor", "weather", "finance"],
    members: [
      { id: "supervisor", name: "Supervisor", role: "Team coordination" },
      { id: "weather", name: "Weather Agent", role: "Weather forecasts and queries" },
      { id: "finance", name: "Finance Agent", role: "Bookkeeping and expenses" },
    ],
    memory: { mode: "isolated" },
    coordination: {
      supervisorStyle: "concierge",
      maxMembers: 8,
      hopLimit: 5,
      memberTimeoutSeconds: 30,
      supervisorFallbackEnabled: true,
    },
    visibility: { mode: "team" },
    bindings: [],
    ...overrides,
  };
}

const members: MemberInfo[] = [
  { id: "weather", name: "Weather Agent", role: "Weather forecasts and queries" },
  { id: "finance", name: "Finance Agent", role: "Bookkeeping and expenses" },
];

describe("supervisor-soul", () => {
  describe("generateSupervisorSoul", () => {
    it("contains team name", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Test Team");
    });

    it("contains all member names", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Weather Agent");
      expect(soul).toContain("Finance Agent");
    });

    it("contains member roles", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Weather forecasts");
      expect(soul).toContain("Bookkeeping");
    });

    it("generates concierge mode instructions", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          coordination: { ...makeProject().coordination, supervisorStyle: "concierge" },
        }),
        members,
      );
      expect(soul).toContain("Concierge");
      expect(soul).toContain("greet");
    });

    it("generates delegate-only mode instructions", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          coordination: { ...makeProject().coordination, supervisorStyle: "delegate-only" },
        }),
        members,
      );
      expect(soul).toContain("Delegate-Only");
      expect(soul).toContain("MUST NOT answer business questions");
    });

    it("includes brand constraints when present", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          constraints: {
            brandRules: {
              userAddress: "dear customer",
              forbidden: ["competitor", "cheap"],
              safetyRules: ["Always verify identity"],
            },
          },
        }),
        members,
      );
      expect(soul).toContain("dear customer");
      expect(soul).toContain('"competitor"');
      expect(soul).toContain('"cheap"');
      expect(soul).toContain("Always verify identity");
    });

    it("includes operating rules", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("5"); // hopLimit
      expect(soul).toContain("30 seconds"); // timeout
    });

    it("includes handoff protocol", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Handoff Protocol");
      expect(soul).toContain("sessions_send");
      expect(soul).toContain("Session Affinity");
    });
  });

  describe("visibility modes", () => {
    it("unified mode: identity uses displayName, not team name", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "unified", displayName: "SmartBot" } }),
        members,
      );
      expect(soul).toContain('You are "SmartBot"');
      expect(soul).not.toContain("Supervisor of team");
    });

    it("unified mode: falls back to project name if no displayName", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "unified" } }),
        members,
      );
      expect(soul).toContain('You are "Test Team"');
    });

    it("unified mode: includes Response Style section", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "unified", displayName: "SmartBot" } }),
        members,
      );
      expect(soul).toContain("Response Style");
      expect(soul).toContain('respond as "SmartBot"');
      expect(soul).toContain("Never reveal internal team structure");
    });

    it("unified mode: uses minimal members section (no bold names)", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "unified" } }),
        members,
      );
      expect(soul).toContain("Internal Routing Members");
      expect(soul).toContain("never reveal to users");
      // Should NOT have the bold-name format from full members section
      expect(soul).not.toContain("**Weather Agent**");
      // But should still have IDs for routing
      expect(soul).toContain("`weather`");
      expect(soul).toContain("`finance`");
    });

    it("team mode: uses full members section", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("## Team Members");
      expect(soul).toContain("**Weather Agent**");
      expect(soul).not.toContain("Internal Routing Members");
    });

    it("team mode: no Response Style section", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).not.toContain("Response Style");
    });

    it("transparent mode: no Response Style section", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "transparent" } }),
        members,
      );
      expect(soul).not.toContain("Response Style");
    });

    it("team mode: identity says Supervisor of team", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain('Supervisor of team "Test Team"');
    });
  });

  describe("handoffStyle", () => {
    it("defaults to notify for team mode", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Handoff Style: Notify");
    });

    it("defaults to silent for unified mode", () => {
      const soul = generateSupervisorSoul(
        makeProject({ visibility: { mode: "unified" } }),
        members,
      );
      expect(soul).toContain("Handoff Style: Silent");
    });

    it("explicit silent overrides default", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          coordination: {
            ...makeProject().coordination,
            handoffStyle: "silent",
          },
        }),
        members,
      );
      expect(soul).toContain("Handoff Style: Silent");
      expect(soul).toContain("Do NOT tell the user");
    });

    it("explicit introduce style", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          coordination: {
            ...makeProject().coordination,
            handoffStyle: "introduce",
          },
        }),
        members,
      );
      expect(soul).toContain("Handoff Style: Introduce");
      expect(soul).toContain("introduce them briefly");
    });

    it("explicit notify style", () => {
      const soul = generateSupervisorSoul(
        makeProject({
          coordination: {
            ...makeProject().coordination,
            handoffStyle: "notify",
          },
        }),
        members,
      );
      expect(soul).toContain("Handoff Style: Notify");
      expect(soul).toContain("briefly inform the user");
    });
  });

  describe("structured context in handoff protocol", () => {
    it("includes INTENT/PRIOR/CONSTRAINT priority structure", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("[INTENT]");
      expect(soul).toContain("[PRIOR]");
      expect(soul).toContain("[CONSTRAINT]");
    });

    it("includes a concrete example for LLM guidance", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("Example:");
      expect(soul).toContain("product comparison table");
    });

    it("specifies max 3 sentences total", () => {
      const soul = generateSupervisorSoul(makeProject(), members);
      expect(soul).toContain("max 3 sentences total");
    });

    it("structured context is present in all visibility modes", () => {
      for (const mode of ["unified", "team", "transparent"] as const) {
        const soul = generateSupervisorSoul(makeProject({ visibility: { mode } }), members);
        expect(soul).toContain("[INTENT]");
        expect(soul).toContain("[PRIOR]");
        expect(soul).toContain("[CONSTRAINT]");
      }
    });

    it("structured context is present in all handoff styles", () => {
      for (const style of ["silent", "notify", "introduce"] as const) {
        const soul = generateSupervisorSoul(
          makeProject({
            coordination: { ...makeProject().coordination, handoffStyle: style },
          }),
          members,
        );
        expect(soul).toContain("[INTENT]");
      }
    });
  });

  describe("generateRoutingTable", () => {
    it("creates routing table with all members", () => {
      const table = generateRoutingTable(members);
      expect(table).toContain("Routing Table");
      expect(table).toContain("Weather Agent");
      expect(table).toContain("Finance Agent");
    });

    it("uses markdown table format", () => {
      const table = generateRoutingTable(members);
      expect(table).toContain("|");
      expect(table).toContain("Keywords");
      expect(table).toContain("Route To");
    });
  });
});
