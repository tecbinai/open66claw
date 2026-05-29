/**
 * Shared test helpers for agent-team test suites.
 */

import type { Project } from "../types.js";

/**
 * Create a Project with sensible defaults for testing.
 * Pass partial overrides to customize specific fields.
 */
export function makeProject(overrides?: Partial<Project>): Project {
  return {
    projectId: "proj-test",
    name: "Test Team",
    description: "A test team",
    status: "active",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    supervisorId: "supervisor",
    memberIds: ["supervisor", "agent-a", "agent-b"],
    members: [
      { id: "supervisor", name: "Supervisor", role: "Supervisor" },
      { id: "agent-a", name: "Alice", role: "Customer Support" },
      { id: "agent-b", name: "Bob", role: "Technical Expert" },
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
