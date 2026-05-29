/**
 * Agent Team Plugin — Type Definitions
 *
 * All types for the Project-level agent team system.
 * Kept separate so modules can import without circular deps.
 *
 * Migrated from clawdbot extensions/agent-team/src/types.ts
 */

// ── Project Status ──────────────────────────────────────────────────────

export type ProjectStatus = "deploying" | "active" | "paused" | "archived" | "error";

// ── Team Constraints (NOT unified personality — two-layer model) ────────

export type TeamConstraints = {
  brandRules?: {
    /** How to address the user, e.g. "您" */
    userAddress?: string;
    /** Words/phrases that all team members must never use */
    forbidden?: string[];
    /** Safety rules applied to all members */
    safetyRules?: string[];
  };
};

// ── Project Memory Config ───────────────────────────────────────────────

export type ProjectMemoryMode = "isolated" | "read-shared";

/** Categories eligible for cross-agent sharing in the shared memory pool. */
export type SharedCategory = "fact" | "identity" | "preference";

export type ProjectMemoryConfig = {
  /** Memory sharing mode. Phase 1: "isolated" only. Phase 3 adds "read-shared". */
  mode: ProjectMemoryMode;
  /** Max entries in shared memory pool (only applies to read-shared mode) */
  maxSharedEntries?: number;
  /** Percentage of system prompt budget for shared memory injection */
  sharedBudgetPercent?: number;
  /** Categories eligible for sharing. Default: ["fact", "identity"] */
  sharedCategories?: SharedCategory[];
};

// ── Project Coordination Config ─────────────────────────────────────────

export type SupervisorStyle = "concierge" | "delegate-only";

export type FastPathConfig = {
  /** Enable session affinity routing */
  sessionAffinityEnabled: boolean;
  /** Affinity timeout in minutes — after idle, re-evaluate routing */
  affinityTimeoutMinutes: number;
  /** Minimum confidence for keyword match (0-1). Below this, falls through to LLM. */
  keywordConfidenceThreshold: number;
};

export type HandoffStyle = "silent" | "notify" | "introduce";

export type ProjectCoordinationConfig = {
  /** Supervisor interaction style */
  supervisorStyle: SupervisorStyle;
  /** Max team members allowed */
  maxMembers: number;
  /** Max routing hops per conversation to prevent loops (GAP-2) */
  hopLimit: number;
  /** Timeout for member agent responses in seconds */
  memberTimeoutSeconds: number;
  /** Whether supervisor auto-takes-over when member is down */
  supervisorFallbackEnabled: boolean;
  /** Fast Path Router settings (Phase 2) */
  fastPath?: FastPathConfig;
  /** How routing/handoff is communicated to the user */
  handoffStyle?: HandoffStyle;
};

// ── Task Coordination Config ────────────────────────────────────────────

export type TaskCoordinationConfig = {
  /** Max concurrent sub-tasks per user request (default: 3) */
  maxConcurrentSubTasks?: number;
  /** Enable template workflow matching for zero-token decomposition */
  templateWorkflowsEnabled?: boolean;
};

// ── Project Visibility ──────────────────────────────────────────────────

export type VisibilityMode = "unified" | "team" | "transparent";

export type ProjectVisibility = {
  /**
   * How the team appears to end users:
   *   "unified"     — single persona, members invisible
   *   "team"        — team brand shown, member names visible
   *   "transparent" — each member speaks as themselves
   */
  mode: VisibilityMode;
  /** Display name shown to users (used in "unified" and "team" modes) */
  displayName?: string;
  /** Display emoji */
  displayEmoji?: string;
};

// ── Project Budget ──────────────────────────────────────────────────────

export type ProjectBudget = {
  /** Max cost per conversation in USD */
  maxCostPerConversation?: number;
  /** Max total tokens per turn across all members */
  maxTokensPerTurn?: number;
};

// ── Project Binding (channel → project mapping) ─────────────────────────

export type ProjectBinding = {
  /** Channel identifier (e.g., "wechat", "feishu", "web") */
  channel: string;
  /** Optional account filter */
  accountId?: string;
  /** Optional peer/contact filter */
  peer?: string;
};

// ── Member Info (lightweight summary used in SOUL generation) ───────────

export type MemberInfo = {
  id: string;
  name: string;
  role: string;
  emoji?: string;
  /** Routing keywords for fast-path keyword matching */
  keywords?: string[];
  /** Tool profile assigned to this agent (informational, actual config lives in agent config) */
  toolProfile?: string;
  /** Model tier assigned to this agent */
  modelTier?: string;
};

// ── The Core Project Entity ─────────────────────────────────────────────

export type Project = {
  /** Unique project id: "proj-{YYYYMMDD}-{8hex}" */
  projectId: string;
  /** Human-readable project name */
  name: string;
  /** Short description of what this team does */
  description: string;
  /** Current status */
  status: ProjectStatus;
  /** Monotonically increasing version for optimistic concurrency */
  version: number;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;

  // ── Team Composition ──
  /** Agent ID of the supervisor (must be in the agents list) */
  supervisorId: string;
  /** Agent IDs of all team members (including supervisor) */
  memberIds: string[];
  /** Lightweight member info for SOUL generation (denormalized) */
  members: MemberInfo[];

  // ── Configuration ──
  memory: ProjectMemoryConfig;
  coordination: ProjectCoordinationConfig;
  visibility: ProjectVisibility;
  constraints?: TeamConstraints;
  budget?: ProjectBudget;
  bindings: ProjectBinding[];

  // ── Supervisor ──
  /** Whether the supervisor was auto-created (independent, not a worker agent) */
  autoSupervisor?: boolean;

  // ── Task Coordination ──
  /** Task coordination config for multi-step task decomposition */
  taskCoordination?: TaskCoordinationConfig;

  // ── Provenance ──
  /** Orchestrator plan ID if created from orchestrator deploy */
  sourcePlanId?: string;
  /** Template ID if created from a template */
  templateId?: string;

  // ── Federation (Project-of-Projects) ──
  /**
   * If true, this is a federation meta-project.
   * Its "members" are supervisors of child projects, not regular agents.
   * The fast-path router cascades: meta-supervisor → child supervisor → member.
   */
  isFederation?: boolean;
  /** Child project IDs (only set when isFederation = true) */
  childProjectIds?: string[];
  /** Parent federation project ID (set on child projects for back-reference) */
  parentProjectId?: string;
};

// ── Member Health ───────────────────────────────────────────────────────

export type MemberHealthState = "healthy" | "degraded" | "down";

export type MemberHealth = {
  agentId: string;
  state: MemberHealthState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  /** ISO timestamp when a "down" agent was last probed for recovery */
  lastProbeAt?: string;
};

// ── Member Stats (Phase 4: Observability) ──────────────────────────────

export type MemberStats = {
  agentId: string;
  callCount: number;
  totalDurationMs: number;
  lastCallAt?: string;
};

// ── Project Runtime State ───────────────────────────────────────────────

export type ProjectState = {
  projectId: string;
  memberHealth: MemberHealth[];
  memberStats?: MemberStats[];
  activeSessions: number;
  lastActivityAt: string;
};

// ── Keyword Route (for Phase 1 basic routing, Phase 2 fast path) ───────

export type KeywordRoute = {
  /** Keyword or phrase pattern */
  pattern: string;
  /** Target agent ID */
  agentId: string;
  /** Lower number = higher priority (default: 100) */
  priority?: number;
};

export type KeywordMatch = {
  agentId: string;
  confidence: number;
  matchedPattern: string;
};

// ── Fast Path Router Types (Phase 2) ────────────────────────────────────

export type RoutingMethod = "affinity" | "keyword" | "supervisor-llm";

export type FastPathResult = {
  agentId: string;
  method: RoutingMethod;
  confidence: number;
  matchedPattern?: string;
};

export type SessionAffinityRecord = {
  /** Sender/peer ID */
  peerId: string;
  /** Currently affinitized agent */
  agentId: string;
  /** ISO timestamp of last activity */
  lastActiveAt: string;
  /** Count of consecutive messages to this agent */
  messageCount: number;
};

// ── Deploy Report (structured result from deploy-bridge) ────────────────

export type DeployStepStatus = "ok" | "warn" | "fail";

export type DeployStepReport = {
  step: string;
  status: DeployStepStatus;
  detail?: string;
};

export type AgentDeployReport = {
  agentId: string;
  name: string;
  role: string;
  emoji?: string;
  modelTier?: string;
  toolProfile?: string;
  steps: DeployStepReport[];
};

export type ProjectDeployReport = {
  projectId: string;
  projectName: string;
  agents: AgentDeployReport[];
  summary: {
    totalAgents: number;
    readyAgents: number;
    toolPoliciesWritten: number;
    keywordsPopulated: number;
    soulsWritten: number;
  };
};

// ── Gateway call function type (shared with orchestrator) ──────────────

export type CallGatewayFn = (method: string, params: Record<string, unknown>) => Promise<unknown>;
