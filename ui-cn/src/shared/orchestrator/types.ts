/**
 * Orchestrator Plugin — Type Definitions
 *
 * All types for the multi-agent orchestration system.
 * Kept separate so modules can import without circular deps.
 */

// ── User Context (from guided questionnaire) ────────────────────────────

export type UserContext = {
  /** Scenario tag: "customer_support" | "coding" | "content" | "data_analysis" | "scheduling" | "research" | "finance" | "learning" | "general" */
  scenario: string;
  /** Integration channels: ["wechat", "dingtalk", "feishu", "web"] */
  channels: string[];
  /** Existing resources: ["faq_doc", "pdf", "database", "api", "github", "notion"] */
  resources: string[];
  /** Volume expectation */
  volume: "low" | "medium" | "high";
  /** Budget preference */
  budget: "cheap" | "balanced" | "premium";
};

// ── Inferred Capabilities (computed by capability-inference engine) ──────

export type InferredCapabilities = {
  model: {
    primary: string; // "deepseek/deepseek-chat"
    fallbacks?: string[];
  };
  tools: {
    profile?: string; // "coding" | "messaging" | "minimal" | "full"
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
  skills: string[];
  mcpHints: string[];
  memorySearch: {
    enabled: boolean;
    sources?: string[];
  };
  identity: {
    name: string;
    emoji?: string;
  };
  subagents?: {
    maxDepth?: number;
    allowAgents?: string[];
  };
  heartbeat?: {
    every: string; // e.g. "24h", "8h"
    activeHours?: {
      start?: string; // e.g. "09:00"
      end?: string; // e.g. "21:00"
    };
  };
};

// ── Agent Blueprint (the "plan" for a single agent) ──────────────────────

export type AgentBlueprint = {
  /** Human-readable short name, e.g. "记账助手" */
  name: string;
  /** Slug-safe id derived from name, e.g. "bookkeeper" */
  id: string;
  /** One-sentence role description */
  role: string;
  /** Full SOUL.md content to write */
  soul: string;
  /** Emoji for IDENTITY.md */
  emoji?: string;
  /** Model tier recommendation */
  modelTier: ModelTier;
  /** Explicit model id override (optional) */
  modelId?: string;
  /** Recommended tools */
  tools: AgentToolRecommendation;
  /** Dependencies: ids of agents that must finish before this one starts */
  dependsOn?: string[];
  /** Inferred full capabilities (filled by capability-inference engine) */
  inferredCapabilities?: InferredCapabilities;
  /** Routing keywords for fast-path keyword matching in agent-team */
  routingKeywords?: string[];
  /** Human-readable ability descriptions for UI preview cards */
  abilities?: string[];
};

export type AgentToolRecommendation = {
  /** Tool allow-list groups, e.g. ["group:web", "group:fs"] */
  allow?: string[];
  /** Tool deny-list */
  deny?: string[];
  /** Tool profile preset, e.g. "coding", "messaging", "minimal" */
  profile?: string;
  /** Skills to enable */
  skills?: string[];
  /** MCP servers to suggest */
  mcpServers?: string[];
};

// ── Orchestration Plan ───────────────────────────────────────────────────

export type OrchestrationMode = "template" | "guided" | "manual";

export type OrchestrationPlan = {
  /** Unique plan id */
  planId: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** User's original requirement text */
  requirement: string;
  /** Template id if matched, undefined if custom */
  templateId?: string;
  /** The agent blueprints */
  agents: AgentBlueprint[];
  /** Short team name (e.g. template name or "定制团队") */
  teamName?: string;
  /** Overall description of what this team does */
  teamDescription: string;
  /** Estimated total token budget per turn */
  estimatedTokensPerTurn?: number;
  /** Creation mode */
  mode: OrchestrationMode;
  /** Structured user context from guided questionnaire */
  userContext?: UserContext;
  /** Post-deploy usage guide text */
  usageGuide?: string;
  /** Policy when a single agent fails during deploy: "continue" keeps going, "abort" stops the sequence */
  onAgentFail?: "continue" | "abort";
  /** Scene verification result from scene-verifier */
  verification?: {
    overallPass: boolean;
    score: number;
    report: string;
  };
};

// ── Orchestration State (runtime tracking) ───────────────────────────────

export type AgentDeployStatus =
  | "pending"
  | "creating"
  | "configuring"
  | "writing_soul"
  | "ready"
  | "failed";

export type AgentDeployState = {
  /** Agent ID used in the gateway (may include team prefix) */
  agentId: string;
  /** Original blueprint ID (local to the plan) */
  blueprintId: string;
  status: AgentDeployStatus;
  error?: string;
  createdAt?: string;
  readyAt?: string;
};

export type OrchestrationStatus =
  | "draft" // Guided construction in progress, can be modified
  | "planning" // Legacy: plan created but not confirmed
  | "confirming" // Plan confirmed, awaiting deploy
  | "deploying" // Deployment in progress
  | "deployed" // All agents deployed successfully
  | "failed" // Deployment failed
  | "rolled_back" // Agents deleted via rollback
  | "cancelled"; // Deploy cancelled by concurrent rollback

export type OrchestrationState = {
  planId: string;
  status: OrchestrationStatus;
  agents: AgentDeployState[];
  deployStartedAt?: string;
  deployFinishedAt?: string;
  error?: string;
};

// ── Model Gate ───────────────────────────────────────────────────────────

export type ModelTier = "cheap" | "mid" | "sota";

export type ModelGateResult = {
  eligible: boolean;
  modelId: string;
  contextWindow?: number;
  tier?: ModelTier;
  reason?: string;
  suggestions?: string[];
};

// ── Scene Template ───────────────────────────────────────────────────────

export type SceneTemplate = {
  /** Template id (directory name) */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category tag */
  category?: string;
  /** Emoji icon */
  emoji?: string;
  /** Pre-defined agent blueprints */
  agents: AgentBlueprint[];
  /** Default model tier for execution agents */
  defaultModelTier?: ModelTier;
  /** Keywords for matching user intent */
  keywords?: string[];
  /** User-facing highlights: 3 short phrases describing what this team can do */
  highlights?: string[];
};

// ── Gathering Questions ──────────────────────────────────────────────────

export type GatheringQuestion = {
  key: string;
  text: string;
  options: string[];
  answer?: string;
};

// ── Tool Actions ─────────────────────────────────────────────────────────

export type OrchestrateAction =
  | "plan"
  | "confirm"
  | "deploy"
  | "status"
  | "rollback"
  | "templates"
  // Guided orchestration actions
  | "quick_deploy"
  | "guided_propose"
  | "guided_refine"
  | "guided_deploy"
  // Validation
  | "validate"
  | "scene_verify";

// ── Deploy Result (internal) ─────────────────────────────────────────────

export type AgentDeployResult = {
  agentId: string;
  name: string;
  status: "ready" | "failed";
  error?: string;
};

export type DeployResult = {
  planId: string;
  agents: AgentDeployResult[];
  finalStatus: OrchestrationStatus;
};
