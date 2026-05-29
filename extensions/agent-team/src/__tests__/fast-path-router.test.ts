import { describe, expect, it, beforeEach } from "vitest";
import {
  routeMessage,
  setRouteTable,
  clearRouteTable,
  resetAllRouteTables,
  DEFAULT_FAST_PATH_CONFIG,
} from "../fast-path-router.js";
import { buildRoutesFromMembers } from "../keyword-router.js";
import { createInitialMemberHealth, recordMemberFailure } from "../member-health.js";
import { setAffinity, resetAllAffinities } from "../session-affinity.js";
import type { MemberHealth, Project } from "../types.js";

function makeProject(overrides?: Partial<Project>): Project {
  return {
    projectId: "proj-test-router",
    name: "Router Test Team",
    description: "Test",
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

function makeHealthMap(project: Project): Map<string, MemberHealth> {
  const map = new Map<string, MemberHealth>();
  for (const id of project.memberIds) {
    map.set(id, createInitialMemberHealth(id));
  }
  return map;
}

beforeEach(() => {
  resetAllAffinities();
  resetAllRouteTables();
});

describe("fast-path-router", () => {
  describe("routeMessage — Layer 1: Session Affinity", () => {
    it("routes to affinitized agent", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // Set affinity: peer-1 → weather
      setAffinity("proj-test-router", "peer-1", "weather");

      const result = routeMessage({
        message: "Hello again",
        project,
        peerId: "peer-1",
        healthMap,
      });

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("weather");
      expect(result!.method).toBe("affinity");
      expect(result!.confidence).toBe(0.9);
    });

    it("skips expired affinity", () => {
      const project = makeProject({
        coordination: {
          ...makeProject().coordination,
          fastPath: {
            ...DEFAULT_FAST_PATH_CONFIG,
            affinityTimeoutMinutes: 0, // Expire immediately
          },
        },
      });
      const healthMap = makeHealthMap(project);

      setAffinity("proj-test-router", "peer-1", "weather");

      const result = routeMessage({
        message: "Hello again",
        project,
        peerId: "peer-1",
        healthMap,
      });

      // Affinity expired → null (no keyword routes set up)
      expect(result).toBeNull();
    });

    it("skips affinity when agent is down", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // Set affinity to weather
      setAffinity("proj-test-router", "peer-1", "weather");

      // Make weather agent "down" (5+ consecutive failures)
      let health = healthMap.get("weather")!;
      for (let i = 0; i < 5; i++) {
        health = recordMemberFailure(health);
      }
      healthMap.set("weather", health);
      expect(health.state).toBe("down");

      const result = routeMessage({
        message: "Hello again",
        project,
        peerId: "peer-1",
        healthMap,
      });

      // Affinity agent is down → falls through to keyword (then null, no routes)
      expect(result).toBeNull();
    });

    it("skips affinity when disabled", () => {
      const project = makeProject({
        coordination: {
          ...makeProject().coordination,
          fastPath: {
            ...DEFAULT_FAST_PATH_CONFIG,
            sessionAffinityEnabled: false,
          },
        },
      });
      const healthMap = makeHealthMap(project);

      setAffinity("proj-test-router", "peer-1", "weather");

      const result = routeMessage({
        message: "Hello again",
        project,
        peerId: "peer-1",
        healthMap,
      });

      // Affinity disabled → null (no keyword routes)
      expect(result).toBeNull();
    });
  });

  describe("routeMessage — Layer 2: Keyword Match", () => {
    it("routes by keyword match", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // Build and set route table from member info
      const nonSupervisor = project.members.filter((m) => m.id !== "supervisor");
      const routes = buildRoutesFromMembers(nonSupervisor);
      setRouteTable("proj-test-router", routes);

      const result = routeMessage({
        message: "What's the weather today?",
        project,
        peerId: "peer-new",
        healthMap,
      });

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("weather");
      expect(result!.method).toBe("keyword");
    });

    it("routes by member name match (higher priority)", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      const nonSupervisor = project.members.filter((m) => m.id !== "supervisor");
      const routes = buildRoutesFromMembers(nonSupervisor);
      setRouteTable("proj-test-router", routes);

      const result = routeMessage({
        message: "I want to talk to Finance Agent",
        project,
        peerId: "peer-new",
        healthMap,
      });

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("finance");
      expect(result!.method).toBe("keyword");
    });

    it("skips keyword match below confidence threshold", () => {
      const project = makeProject({
        coordination: {
          ...makeProject().coordination,
          fastPath: {
            ...DEFAULT_FAST_PATH_CONFIG,
            keywordConfidenceThreshold: 0.99, // Very high threshold
          },
        },
      });
      const healthMap = makeHealthMap(project);

      const nonSupervisor = project.members.filter((m) => m.id !== "supervisor");
      const routes = buildRoutesFromMembers(nonSupervisor);
      setRouteTable("proj-test-router", routes);

      const result = routeMessage({
        message:
          "This is a very long message that mentions weather briefly among many other topics that dilute the confidence",
        project,
        peerId: "peer-new",
        healthMap,
      });

      // Confidence too low → null
      expect(result).toBeNull();
    });

    it("skips down agents in keyword routing", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      const nonSupervisor = project.members.filter((m) => m.id !== "supervisor");
      const routes = buildRoutesFromMembers(nonSupervisor);
      setRouteTable("proj-test-router", routes);

      // Make weather agent "down"
      let health = healthMap.get("weather")!;
      for (let i = 0; i < 5; i++) {
        health = recordMemberFailure(health);
      }
      healthMap.set("weather", health);

      const result = routeMessage({
        message: "Weather Agent please help",
        project,
        peerId: "peer-new",
        healthMap,
      });

      // Weather agent is down → no match (the keyword "Weather Agent" points to "weather" which is down)
      expect(result).toBeNull();
    });
  });

  describe("routeMessage — Edge Cases", () => {
    it("returns null for empty message", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      const result = routeMessage({
        message: "",
        project,
        peerId: "peer-1",
        healthMap,
      });

      expect(result).toBeNull();
    });

    it("returns null for whitespace-only message", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      const result = routeMessage({
        message: "   ",
        project,
        peerId: "peer-1",
        healthMap,
      });

      expect(result).toBeNull();
    });

    it("returns null when all members are down", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // Make all non-supervisor members down
      for (const id of ["weather", "finance"]) {
        let health = healthMap.get(id)!;
        for (let i = 0; i < 5; i++) {
          health = recordMemberFailure(health);
        }
        healthMap.set(id, health);
      }

      setAffinity("proj-test-router", "peer-1", "weather");
      const nonSupervisor = project.members.filter((m) => m.id !== "supervisor");
      setRouteTable("proj-test-router", buildRoutesFromMembers(nonSupervisor));

      const result = routeMessage({
        message: "weather forecast please",
        project,
        peerId: "peer-1",
        healthMap,
      });

      expect(result).toBeNull();
    });

    it("never routes to supervisor directly", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // Manually add a route that points to supervisor
      setRouteTable("proj-test-router", [
        { pattern: "coordination", agentId: "supervisor", priority: 10 },
      ]);

      const result = routeMessage({
        message: "I need coordination help",
        project,
        peerId: "peer-1",
        healthMap,
      });

      // Supervisor is filtered out from routable members
      expect(result).toBeNull();
    });

    it("returns null with no route table", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);

      // No affinity, no route table
      const result = routeMessage({
        message: "Hello world",
        project,
        peerId: "peer-new",
        healthMap,
      });

      expect(result).toBeNull();
    });
  });

  describe("route table cache", () => {
    it("setRouteTable and clearRouteTable work", () => {
      const project = makeProject();
      const healthMap = makeHealthMap(project);
      const routes = [{ pattern: "test", agentId: "weather", priority: 50 }];

      setRouteTable("proj-test-router", routes);

      const result1 = routeMessage({
        message: "test message",
        project,
        peerId: "peer-1",
        healthMap,
      });
      expect(result1).not.toBeNull();
      expect(result1!.agentId).toBe("weather");

      clearRouteTable("proj-test-router");

      const result2 = routeMessage({
        message: "test message",
        project,
        peerId: "peer-1",
        healthMap,
      });
      expect(result2).toBeNull();
    });
  });
});
