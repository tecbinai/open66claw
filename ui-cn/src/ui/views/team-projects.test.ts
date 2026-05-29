import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type {
  TeamProjectSummary,
  TeamProjectDetail,
  TeamProjectHealthResult,
  AgentsListResult,
  AgentIdentityResult,
} from "../types";
import {
  renderProjectSidebarGroups,
  renderProjectDetail,
  type ProjectSidebarProps,
  type ProjectDetailProps,
  type ProjectDetailTab,
} from "./team-projects";

// ── Helpers ──────────────────────────────────────────────────────────────

function createSummary(overrides: Partial<TeamProjectSummary> = {}): TeamProjectSummary {
  return {
    projectId: "proj-1",
    name: "Test Team",
    description: "A test team",
    status: "active",
    memberCount: 3,
    memberIds: ["sup-1", "worker-a", "worker-b"],
    supervisorId: "sup-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    autoSupervisor: true,
    ...overrides,
  };
}

function createDetail(overrides: Partial<TeamProjectDetail["project"]> = {}): TeamProjectDetail {
  return {
    project: {
      projectId: "proj-1",
      name: "Test Team",
      description: "A test team",
      status: "active",
      supervisorId: "sup-1",
      memberIds: ["sup-1", "worker-a", "worker-b"],
      members: [
        {
          id: "sup-1",
          name: "Team Supervisor",
          role: "Team coordinator and message router",
          emoji: "🎯",
        },
        {
          id: "worker-a",
          name: "文案写手",
          role: "内容创作",
          emoji: "✍️",
          keywords: ["文案", "写作"],
        },
        {
          id: "worker-b",
          name: "配图助手",
          role: "图片配图",
          emoji: "🖼️",
          keywords: ["配图", "图片"],
        },
      ],
      version: 1,
      autoSupervisor: true,
      memory: { mode: "shared" },
      visibility: { mode: "public" },
      coordination: {
        hopLimit: 3,
        memberTimeoutSeconds: 30,
        supervisorFallbackEnabled: true,
      },
      ...overrides,
    },
    state: null,
  };
}

function createAgentsList(): AgentsListResult {
  return {
    ts: 0,
    agents: [
      { id: "sup-1", name: "Team Supervisor" },
      { id: "worker-a", name: "文案写手" },
      { id: "worker-b", name: "配图助手" },
    ],
  } as unknown as AgentsListResult;
}

function createSidebarProps(overrides: Partial<ProjectSidebarProps> = {}): ProjectSidebarProps {
  return {
    projects: [createSummary()],
    agents: createAgentsList(),
    agentIdentityById: {} as Record<string, AgentIdentityResult>,
    selectedProjectId: "proj-1",
    selectedAgentId: null,
    defaultAgentId: null,
    collapsedProjects: new Set(),
    onSelectProject: vi.fn(),
    onSelectAgent: vi.fn(),
    onToggleCollapse: vi.fn(),
    ...overrides,
  };
}

function createDetailProps(overrides: Partial<ProjectDetailProps> = {}): ProjectDetailProps {
  return {
    detail: createDetail(),
    detailLoading: false,
    health: null,
    stats: null,
    memory: null,
    activity: null,
    tab: "members" as ProjectDetailTab,
    busy: false,
    agentIdentityById: {} as Record<string, AgentIdentityResult>,
    onSelectTab: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onDelete: vi.fn(),
    onLoadStats: vi.fn(),
    onLoadMemory: vi.fn(),
    onClearMemory: vi.fn(),
    onLoadActivity: vi.fn(),
    onSelectAgent: vi.fn(),
    onRemoveMember: vi.fn(),
    ...overrides,
  };
}

// ── Sidebar Tests ────────────────────────────────────────────────────────

describe("team-projects sidebar", () => {
  it("renders supervisor row with agent-row--supervisor class", () => {
    const container = document.createElement("div");
    const result = renderProjectSidebarGroups(createSidebarProps());
    render(result!, container);

    const rows = Array.from(container.querySelectorAll(".agent-row--nested"));
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const supervisorRow = rows.find((r) => r.classList.contains("agent-row--supervisor"));
    expect(supervisorRow).not.toBeUndefined();
  });

  it("only marks supervisor row, not worker rows", () => {
    const container = document.createElement("div");
    render(renderProjectSidebarGroups(createSidebarProps())!, container);

    const supervisorRows = Array.from(container.querySelectorAll(".agent-row--supervisor"));
    expect(supervisorRows.length).toBe(1);
  });

  it("shows supervisor pill badge with 🎯 for auto-supervisor", () => {
    const container = document.createElement("div");
    render(renderProjectSidebarGroups(createSidebarProps())!, container);

    const pill = container.querySelector(".agent-pill.auto-supervisor");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain("🎯");
  });

  it("clicking supervisor row calls onSelectAgent with supervisor id", () => {
    const onSelectAgent = vi.fn();
    const container = document.createElement("div");
    render(renderProjectSidebarGroups(createSidebarProps({ onSelectAgent }))!, container);

    const supervisorRow = container.querySelector(".agent-row--supervisor") as HTMLElement;
    supervisorRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectAgent).toHaveBeenCalledWith("sup-1");
  });
});

// ── Members Panel Tests ──────────────────────────────────────────────────

describe("team-projects members panel", () => {
  it("renders supervisor card with project-member-card--supervisor class", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const supervisorCard = container.querySelector(".project-member-card--supervisor");
    expect(supervisorCard).not.toBeNull();
  });

  it("renders only one supervisor card", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const supervisorCards = container.querySelectorAll(".project-member-card--supervisor");
    expect(supervisorCards.length).toBe(1);
  });

  it("renders section dividers for supervisor and members", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const dividers = Array.from(container.querySelectorAll(".project-members-divider"));
    expect(dividers.length).toBe(2);
  });

  it("supervisor section divider appears before members section divider", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const cards = container.querySelector(".project-members-cards");
    expect(cards).not.toBeNull();

    const children = Array.from(cards!.children);
    const dividerIndices = children
      .map((el, i) => (el.classList.contains("project-members-divider") ? i : -1))
      .filter((i) => i >= 0);

    // First divider (supervisor) should come before second (members)
    expect(dividerIndices.length).toBe(2);
    expect(dividerIndices[0]).toBeLessThan(dividerIndices[1]);
  });

  it("supervisor card appears before worker cards", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const allCards = Array.from(container.querySelectorAll(".project-member-card"));
    expect(allCards.length).toBe(3);

    // First card should be the supervisor
    expect(allCards[0].classList.contains("project-member-card--supervisor")).toBe(true);
    // Other cards should not
    expect(allCards[1].classList.contains("project-member-card--supervisor")).toBe(false);
    expect(allCards[2].classList.contains("project-member-card--supervisor")).toBe(false);
  });

  it("supervisor card has a chat button", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const supervisorCard = container.querySelector(".project-member-card--supervisor");
    const chatBtn = supervisorCard!.querySelector(".btn--outline");
    expect(chatBtn).not.toBeNull();
  });

  it("clicking supervisor chat button calls onSelectAgent with supervisor id", () => {
    const onSelectAgent = vi.fn();
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps({ onSelectAgent })), container);

    const supervisorCard = container.querySelector(".project-member-card--supervisor");
    const chatBtn = supervisorCard!.querySelector(".btn--outline") as HTMLElement;
    chatBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectAgent).toHaveBeenCalledWith("sup-1");
  });

  it("supervisor card does NOT have a remove button", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const supervisorCard = container.querySelector(".project-member-card--supervisor");
    const dangerBtn = supervisorCard!.querySelector(".btn--danger");
    expect(dangerBtn).toBeNull();
  });

  it("worker cards have remove buttons", () => {
    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps()), container);

    const workerCards = Array.from(
      container.querySelectorAll(".project-member-card:not(.project-member-card--supervisor)"),
    );
    expect(workerCards.length).toBe(2);

    for (const card of workerCards) {
      const removeBtn = card.querySelector(".btn--danger");
      expect(removeBtn).not.toBeNull();
    }
  });

  it("renders correctly when health data is provided", () => {
    const health: TeamProjectHealthResult = {
      projectId: "proj-1",
      status: "active",
      members: [
        {
          agentId: "sup-1",
          state: "healthy",
          totalSuccesses: 10,
          totalFailures: 0,
          lastError: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        {
          agentId: "worker-a",
          state: "degraded",
          totalSuccesses: 5,
          totalFailures: 2,
          lastError: "timeout",
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        {
          agentId: "worker-b",
          state: "healthy",
          totalSuccesses: 8,
          totalFailures: 1,
          lastError: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
      ],
    };

    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps({ health })), container);

    // Should still render all cards
    const allCards = container.querySelectorAll(".project-member-card");
    expect(allCards.length).toBe(3);

    // Supervisor card should still be highlighted
    expect(allCards[0].classList.contains("project-member-card--supervisor")).toBe(true);
  });

  it("handles project with no supervisor gracefully", () => {
    const detail = createDetail({
      supervisorId: "nonexistent-id",
    });

    const container = document.createElement("div");
    render(renderProjectDetail(createDetailProps({ detail })), container);

    // No supervisor card should appear
    const supervisorCards = container.querySelectorAll(".project-member-card--supervisor");
    expect(supervisorCards.length).toBe(0);

    // All 3 members render as workers
    const workerCards = container.querySelectorAll(".project-member-card");
    expect(workerCards.length).toBe(3);
  });
});
