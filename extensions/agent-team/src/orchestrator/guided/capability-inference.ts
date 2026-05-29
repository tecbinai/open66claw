/**
 * Capability Inference Engine
 *
 * Given an agent blueprint + user context, infers full capabilities:
 * model selection, tool profile, skills, MCP hints, memory, etc.
 *
 * Design: Pure functions. Reads configured providers from ctx.config
 * to only recommend models the user actually has access to.
 */

import type { AgentBlueprint, InferredCapabilities, ModelTier, UserContext } from "../types.js";
import type { DiscoveryResult } from "./runtime-discovery.js";
import {
  matchCapabilitiesToRole,
  mergeWithStaticInference,
  MAX_SKILLS_PER_AGENT,
  MAX_MCP_PER_AGENT,
} from "./runtime-discovery.js";

// ── Model Tier → Candidate Models ────────────────────────────────────────

export type ModelCandidate = {
  fullId: string; // "deepseek/deepseek-chat"
  provider: string; // "deepseek"
  modelId: string; // "deepseek-chat"
  contextWindow: number;
  tier: ModelTier;
  /** Scenario affinity scores */
  affinities: Record<string, number>;
};

const MODEL_CANDIDATES: ModelCandidate[] = [
  // cheap tier
  {
    fullId: "deepseek/deepseek-chat",
    provider: "deepseek",
    modelId: "deepseek-chat",
    contextWindow: 64000,
    tier: "cheap",
    affinities: { general: 8, coding: 7, data_analysis: 7, content: 6 },
  },
  {
    fullId: "siliconflow/deepseek-ai/DeepSeek-V3",
    provider: "siliconflow",
    modelId: "deepseek-ai/DeepSeek-V3",
    contextWindow: 64000,
    tier: "cheap",
    affinities: { general: 8, coding: 7, data_analysis: 7, content: 6 },
  },
  {
    fullId: "qwen/qwen-turbo",
    provider: "qwen",
    modelId: "qwen-turbo",
    contextWindow: 131072,
    tier: "cheap",
    affinities: { general: 6, content: 7, scheduling: 7 },
  },
  {
    fullId: "qwen/qwen-plus",
    provider: "qwen",
    modelId: "qwen-plus",
    contextWindow: 131072,
    tier: "cheap",
    affinities: { general: 7, content: 8, research: 6 },
  },
  {
    fullId: "zhipu/glm-4-plus",
    provider: "zhipu",
    modelId: "glm-4-plus",
    contextWindow: 128000,
    tier: "cheap",
    affinities: { general: 7, content: 7 },
  },
  {
    fullId: "doubao/doubao-seed-1-6-lite-251015",
    provider: "doubao",
    modelId: "doubao-seed-1-6-lite-251015",
    contextWindow: 256000,
    tier: "cheap",
    affinities: { general: 6, scheduling: 7 },
  },
  // mid tier
  {
    fullId: "deepseek/deepseek-reasoner",
    provider: "deepseek",
    modelId: "deepseek-reasoner",
    contextWindow: 64000,
    tier: "mid",
    affinities: { coding: 9, data_analysis: 9, research: 8, customer_support: 6 },
  },
  {
    fullId: "siliconflow/deepseek-ai/DeepSeek-R1",
    provider: "siliconflow",
    modelId: "deepseek-ai/DeepSeek-R1",
    contextWindow: 64000,
    tier: "mid",
    affinities: { coding: 9, data_analysis: 9, research: 8, customer_support: 6 },
  },
  {
    fullId: "openai/gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    contextWindow: 128000,
    tier: "mid",
    affinities: { general: 9, customer_support: 8, content: 8, research: 8 },
  },
  {
    fullId: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
    contextWindow: 200000,
    tier: "mid",
    affinities: { coding: 9, research: 9, general: 8 },
  },
  {
    fullId: "zhipu/glm-5",
    provider: "zhipu",
    modelId: "glm-5",
    contextWindow: 128000,
    tier: "mid",
    affinities: { general: 8, content: 8, customer_support: 7 },
  },
  {
    fullId: "doubao/doubao-seed-1-8-251228",
    provider: "doubao",
    modelId: "doubao-seed-1-8-251228",
    contextWindow: 256000,
    tier: "mid",
    affinities: { general: 8, content: 7 },
  },
  {
    fullId: "kimi-coding/kimi-for-coding",
    provider: "kimi-coding",
    modelId: "kimi-for-coding",
    contextWindow: 262144,
    tier: "mid",
    affinities: { coding: 8, research: 7 },
  },
  {
    fullId: "qwen/qwen-max",
    provider: "qwen",
    modelId: "qwen-max",
    contextWindow: 32000,
    tier: "mid",
    affinities: { general: 8, content: 8, research: 7 },
  },
  // sota tier
  {
    fullId: "anthropic/claude-opus-4-6",
    provider: "anthropic",
    modelId: "claude-opus-4-6",
    contextWindow: 200000,
    tier: "sota",
    affinities: { general: 10, coding: 10, research: 10 },
  },
  {
    fullId: "openai/o3",
    provider: "openai",
    modelId: "o3",
    contextWindow: 200000,
    tier: "sota",
    affinities: { coding: 10, research: 10, data_analysis: 9 },
  },
];

// ── Scenario → Tool Mapping ──────────────────────────────────────────────

const SCENARIO_TOOL_MAP: Record<string, { profile: string; also: string[] }> = {
  customer_support: { profile: "messaging", also: ["web_search", "memory_search"] },
  coding: { profile: "coding", also: ["browser"] },
  research: { profile: "full", also: [] },
  content: { profile: "full", also: ["web_search", "web_fetch"] },
  data_analysis: { profile: "minimal", also: ["group:fs", "group:runtime"] },
  scheduling: { profile: "minimal", also: ["cron", "message"] },
  finance: { profile: "minimal", also: ["group:fs", "group:memory"] },
  learning: { profile: "minimal", also: ["web_search", "memory_search", "web_fetch"] },
  general: { profile: "minimal", also: ["web_search"] },
};

// ── Scenario → Skill Mapping ─────────────────────────────────────────────

const SCENARIO_SKILL_MAP: Record<string, string[]> = {
  customer_support: ["wechat-cs", "summarize", "self-troubleshoot", "faq-builder"],
  coding: ["coding-agent", "github", "web-researcher", "code-review", "git-helper"],
  news: ["ai-daily-news", "cctv-news", "news-aggregator", "rss-reader", "news-briefing"],
  content: ["xiaohongshu", "summarize", "web-researcher", "seo-helper", "copywriting"],
  data_analysis: ["nano-pdf", "csv-analyzer", "data-viz", "sql-helper"],
  finance: ["nano-pdf", "ledger", "budget-tracker"],
  scheduling: ["oracle", "calendar", "todo-tracker"],
  learning: ["web-researcher", "summarize", "flashcard", "quiz-maker"],
  research: ["web-researcher", "summarize", "nano-pdf", "arxiv-reader"],
  general: ["web-researcher", "summarize"],
};

// ── Main Inference Function ──────────────────────────────────────────────

/**
 * Infer full capabilities for an agent based on its blueprint and user context.
 *
 * @param bp - The agent blueprint (name, role, tier, etc.)
 * @param userCtx - Structured user context from guided questionnaire
 * @param pluginConfig - Config object from plugin context (to read configured providers)
 * @param discoveryResult - Runtime discovery of installed skills and MCP servers (optional)
 * @param availableModels - Dynamic model list from models.list gateway call (optional).
 *                          When provided, replaces the static MODEL_CANDIDATES for model selection.
 */
export function inferAgentCapabilities(
  bp: AgentBlueprint,
  userCtx: UserContext,
  pluginConfig?: Record<string, unknown>,
  discoveryResult?: DiscoveryResult,
  availableModels?: ModelCandidate[],
): InferredCapabilities {
  const staticSkills = inferSkills(bp.role, userCtx);
  const staticMCP = inferMCPServers(bp.role, userCtx.resources);

  // If runtime discovery is available, use it for intelligent matching
  let finalSkills: string[];
  let finalMCP: string[];

  if (
    discoveryResult &&
    (discoveryResult.skills.length > 0 || discoveryResult.mcpServers.length > 0)
  ) {
    const runtimeMatch = matchCapabilitiesToRole(bp.role, userCtx.scenario, discoveryResult);
    const merged = mergeWithStaticInference(runtimeMatch, staticSkills, staticMCP);
    finalSkills = merged.skills;
    finalMCP = merged.mcpServers;
  } else {
    // Fallback: use static inference with hard limits
    finalSkills = staticSkills.slice(0, MAX_SKILLS_PER_AGENT);
    finalMCP = staticMCP.slice(0, MAX_MCP_PER_AGENT);
  }

  // Merge blueprint-defined tools with inferred tools so that template/blueprint
  // capabilities (image_gen, video_gen, tts, etc.) are never silently dropped.
  const inferred = inferTools(bp.role, userCtx);
  const mergedAllow = [...new Set([...(inferred.alsoAllow ?? []), ...(bp.tools?.allow ?? [])])];
  const mergedTools: InferredCapabilities["tools"] = {
    profile: bp.tools?.profile ?? inferred.profile,
    alsoAllow: mergedAllow.length > 0 ? mergedAllow : undefined,
    deny: inferred.deny,
  };

  // Merge blueprint skills into finalSkills
  if (bp.tools?.skills?.length) {
    for (const s of bp.tools.skills) {
      if (!finalSkills.includes(s)) finalSkills.push(s);
    }
  }

  return {
    model: selectModel(bp.modelTier, userCtx, pluginConfig, bp.role, bp.id, availableModels),
    tools: mergedTools,
    skills: finalSkills,
    mcpHints: finalMCP,
    memorySearch: inferMemorySearch(bp.role, userCtx),
    identity: { name: bp.name, emoji: bp.emoji },
    subagents: inferSubagents(bp.role),
    heartbeat: inferHeartbeat(bp.role, userCtx),
  };
}

// ── Role Complexity Estimation ────────────────────────────────────────────

const SIMPLE_ROLE_PATTERNS =
  /转发|提醒|通知|监控|打卡|签到|forward|remind|notify|monitor|alert|schedule|定时/i;
const COMPLEX_ROLE_PATTERNS =
  /代码|编程|分析|研究|推理|调研|策划|架构|设计|规划|选型|code|program|analy|research|reason|architect|debug|review|design|plan/i;
const SUPERVISOR_PATTERNS =
  /supervisor|分发|路由|调度|协调|管理|总管|coordinator|orchestrat|dispatch|manager/i;

/**
 * Estimate role complexity to guide model tier selection.
 * - "simple": forwarding, reminding, monitoring — can use cheap models
 * - "moderate": content creation, search, summarization
 * - "complex": coding, analysis, research, multi-step reasoning
 */
export function estimateRoleComplexity(role: string): "simple" | "moderate" | "complex" {
  if (COMPLEX_ROLE_PATTERNS.test(role)) return "complex";
  if (SIMPLE_ROLE_PATTERNS.test(role)) return "simple";
  return "moderate";
}

/**
 * Detect if a role description indicates a supervisor/coordinator agent.
 */
export function isSupervisorRole(role: string, agentId?: string): boolean {
  if (agentId && /supervisor/i.test(agentId)) return true;
  return SUPERVISOR_PATTERNS.test(role);
}

// ── Model Selection ──────────────────────────────────────────────────────

function selectModel(
  tier: ModelTier,
  ctx: UserContext,
  pluginConfig?: Record<string, unknown>,
  role?: string,
  agentId?: string,
  availableModels?: ModelCandidate[],
): InferredCapabilities["model"] {
  const scenario = ctx.scenario || "general";

  // Budget → tier adjustment
  let effectiveTier = tier;
  if (ctx.budget === "cheap" && tier === "mid") effectiveTier = "cheap";
  if (ctx.budget === "premium" && tier === "cheap") effectiveTier = "mid";

  // Supervisor: use the user's configured global text model (not forced SOTA).
  // Chinese users typically use kimi, qwen, deepseek — not claude/openai.
  if (role && isSupervisorRole(role, agentId)) {
    const userModel = getGlobalTextModel(pluginConfig);
    if (userModel) {
      return { primary: userModel };
    }
    // No user-configured model: pick the best available
    effectiveTier = "mid";
  }
  // Simple role downgrade: use cheap model to save cost (unless user wants premium)
  else if (role && ctx.budget !== "premium") {
    const complexity = estimateRoleComplexity(role);
    if (complexity === "simple" && effectiveTier !== "cheap") {
      effectiveTier = "cheap";
    }
  }

  // ── Model pool: prefer dynamic (from models.list), fallback to static ──
  const useDynamic = availableModels && availableModels.length > 0;
  const pool = useDynamic ? availableModels : MODEL_CANDIDATES;

  // Always apply provider filtering — models.list returns ALL discoverable models
  // (including amazon-bedrock, azure-openai, etc.) not just user-configured ones.
  const configured = getConfiguredProviders(pluginConfig);
  if (configured.length === 0) {
    // No configured providers detected at all — prefer globalTextModel
    const globalModel = getGlobalTextModel(pluginConfig);
    if (globalModel) return { primary: globalModel };
  }

  // Filter by tier and configured providers
  let candidates = pool
    .filter((m) => m.tier === effectiveTier)
    .filter((m) => configured.length === 0 || configured.includes(m.provider));

  // Fallback: if no models in target tier, try all tiers
  if (candidates.length === 0) {
    candidates = pool.filter((m) => configured.length === 0 || configured.includes(m.provider));
  }

  // If still no candidates, use global text model or ultimate fallback
  if (candidates.length === 0) {
    const globalModel = getGlobalTextModel(pluginConfig);
    if (globalModel) return { primary: globalModel };
    return { primary: MODEL_CANDIDATES[0].fullId };
  }

  // Score by scenario affinity (tie-break by provider name for determinism)
  const scored = candidates
    .map((m) => ({
      ...m,
      score: (m.affinities[scenario] ?? 5) + (m.tier === effectiveTier ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider));

  const result = {
    primary: scored[0].fullId,
    fallbacks: scored.slice(1, 3).map((m) => m.fullId),
  };
  return result;
}

/** Read the user's global text model from config as a fallback. */
function getGlobalTextModel(config?: Record<string, unknown>): string | undefined {
  try {
    const agents = config?.agents as Record<string, unknown> | undefined;
    const defaults = agents?.defaults as Record<string, unknown> | undefined;
    const model = defaults?.model;
    if (typeof model === "string" && model.includes("/")) return model;
    if (model && typeof model === "object") {
      const primary = (model as Record<string, unknown>).primary;
      if (typeof primary === "string" && primary.includes("/")) return primary;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function getConfiguredProviders(config?: Record<string, unknown>): string[] {
  try {
    const result = new Set<string>();

    // Source 1: config.models.providers (explicit inline providers, e.g. custom-openai)
    const models = config?.models as Record<string, unknown> | undefined;
    const modelProviders = models?.providers;
    if (modelProviders && typeof modelProviders === "object") {
      if (Array.isArray(modelProviders)) {
        for (const p of modelProviders) {
          const id = String(p.id ?? p.name ?? "").trim();
          if (id) result.add(id);
        }
      } else {
        for (const key of Object.keys(modelProviders as Record<string, unknown>)) {
          if (key.trim()) result.add(key.trim());
        }
      }
    }

    // Source 2: config.gateway.providers (alternative config structure)
    const gateway = config?.gateway as Record<string, unknown> | undefined;
    const gwProviders = gateway?.providers;
    if (gwProviders && typeof gwProviders === "object" && !Array.isArray(gwProviders)) {
      for (const key of Object.keys(gwProviders as Record<string, unknown>)) {
        if (key.trim()) result.add(key.trim());
      }
    }

    // Source 3: config.auth.order — setup-wizard writes provider credentials here,
    // NOT to config.models.providers. This is the primary location for standard
    // providers like siliconflow, deepseek, qwen, etc.
    const auth = config?.auth as Record<string, unknown> | undefined;
    const authOrder = auth?.order;
    if (authOrder && typeof authOrder === "object" && !Array.isArray(authOrder)) {
      for (const key of Object.keys(authOrder as Record<string, unknown>)) {
        if (key.trim()) result.add(key.trim());
      }
    }

    // Source 4: extract provider from agents.defaults.model.primary
    // e.g. "siliconflow/deepseek-ai/DeepSeek-V3" → "siliconflow"
    const globalModel = getGlobalTextModel(config);
    if (globalModel) {
      const slash = globalModel.indexOf("/");
      if (slash > 0) {
        result.add(globalModel.slice(0, slash));
      }
    }

    return [...result].filter(Boolean);
  } catch {
    return [];
  }
}

// ── Tools Inference ──────────────────────────────────────────────────────

function inferTools(role: string, ctx: UserContext): InferredCapabilities["tools"] {
  const scenario = ctx.scenario || "general";
  const base = SCENARIO_TOOL_MAP[scenario] ?? SCENARIO_TOOL_MAP.general;
  const also = [...base.also];

  // Channel → tools
  for (const ch of ctx.channels) {
    switch (ch) {
      case "wechat":
        also.push("wechat_send", "wechat_cs");
        break;
      case "dingtalk":
        also.push("dingtalk_send");
        break;
      case "feishu":
        also.push("feishu_send");
        break;
    }
  }

  // Role keyword → tools
  if (/分发|路由|调度|dispatch/i.test(role)) also.push("sessions_spawn", "sessions_send");
  if (/知识库|检索|查询|knowledge/i.test(role)) also.push("memory_search", "memory_get");
  if (/定时|提醒|定期|cron|remind/i.test(role)) also.push("cron");
  if (/代码|编程|code|program/i.test(role)) also.push("group:fs");
  if (/文件|文档|file|doc/i.test(role)) also.push("group:fs");
  if (/数据|分析|data|analy/i.test(role)) also.push("group:fs", "group:runtime");
  if (/配图|图片|封面|插图|image|illustrat|画图|设计图/i.test(role))
    also.push("image_gen", "image_edit");
  if (/视频|短视频|video|vlog|剪辑|动画|animation/i.test(role)) also.push("video_gen", "image_gen");
  if (/语音|播报|朗读|voice|tts|speech|播音/i.test(role)) also.push("tts");
  if (/语音转文字|音频识别|转录|asr|transcribe|听写/i.test(role)) also.push("asr");
  if (/定时|提醒|日程|定期|schedule|remind|calendar/i.test(role)) also.push("cron", "message");
  if (/新闻|资讯|热点|news|briefing/i.test(role)) also.push("web_fetch");
  if (/浏览器|爬虫|scrape|browser|crawl/i.test(role)) also.push("browser");

  return {
    profile: base.profile,
    alsoAllow: [...new Set(also)],
  };
}

// ── Skills Inference ─────────────────────────────────────────────────────

function inferSkills(role: string, ctx: UserContext): string[] {
  const scenario = ctx.scenario || "general";

  // Role-specific skills first (higher priority — directly relevant to this agent's role)
  const roleSkills: string[] = [];
  if (/新闻|news/i.test(role)) roleSkills.push("ai-daily-news", "news-briefing");
  if (/小红书|xiaohongshu/i.test(role)) roleSkills.push("xiaohongshu");
  if (/总结|summarize|摘要/i.test(role)) roleSkills.push("summarize");
  if (/代码|code|编程|program/i.test(role)) roleSkills.push("coding-agent");
  if (/翻译|translate|双语/i.test(role)) roleSkills.push("translator");
  if (/搜索|search|调研|research/i.test(role)) roleSkills.push("web-researcher");
  if (/pdf|文档/i.test(role)) roleSkills.push("nano-pdf");
  if (/日程|calendar|日历/i.test(role)) roleSkills.push("calendar");
  if (/客服|support|接待/i.test(role)) roleSkills.push("self-troubleshoot");
  if (/写作|写文|copywrite|文案|撰写|创作/i.test(role)) roleSkills.push("copywriting");
  if (/数据|data|分析|analy|统计|画像/i.test(role)) roleSkills.push("csv-analyzer");
  if (/图片|image|配图|画|封面/i.test(role)) roleSkills.push("image-helper", "openai-image-gen");
  if (/视频|video|vlog|剪辑|短视频|动画/i.test(role)) roleSkills.push("video-creator");
  if (/github|仓库|repo/i.test(role)) roleSkills.push("github");

  // Resource → skills
  for (const res of ctx.resources) {
    switch (res) {
      case "pdf":
        roleSkills.push("nano-pdf");
        break;
      case "github":
        roleSkills.push("github");
        break;
      case "notion":
        roleSkills.push("notion");
        break;
    }
  }

  // Scenario base skills (lower priority — generic to the scenario)
  const scenarioSkills: string[] = [...(SCENARIO_SKILL_MAP[scenario] ?? [])];

  // Merge: role-specific first, then fill with scenario skills (respects MAX limit downstream)
  const merged = [...roleSkills];
  for (const s of scenarioSkills) {
    if (!merged.includes(s)) merged.push(s);
  }

  return [...new Set(merged)];
}

// ── MCP Server Inference ─────────────────────────────────────────────────

function inferMCPServers(role: string, resources: string[]): string[] {
  const servers: string[] = [];

  // Database & SQL
  if (/数据库|数据分析|database|sql/i.test(role) || resources.includes("database"))
    servers.push("mcp-server-sqlite");
  // File system access
  if (/文件|文档|file|doc/i.test(role)) servers.push("@mcp/server-filesystem");
  // Google Sheets
  if (resources.includes("google_sheets")) servers.push("@anthropic/mcp-google-sheets");
  // GitHub integration
  if (/github|代码仓库|仓库|repo/i.test(role) || resources.includes("github"))
    servers.push("@modelcontextprotocol/server-github");
  // Git operations
  if (/git|版本控制|version.*control/i.test(role)) servers.push("@modelcontextprotocol/server-git");
  // Web search / browsing
  if (/浏览器|爬虫|scrape|browser|crawl/i.test(role)) servers.push("@anthropic/mcp-puppeteer");
  // Notion integration
  if (/notion/i.test(role) || resources.includes("notion"))
    servers.push("@notionhq/mcp-server-notion");
  // Slack messaging
  if (/slack/i.test(role) || resources.includes("slack")) servers.push("@anthropic/mcp-slack");
  // Memory / knowledge store
  if (/知识库|knowledge.*base|向量|vector|rag/i.test(role)) servers.push("@anthropic/mcp-memory");
  // PDF processing
  if (/pdf|文档解析/i.test(role) || resources.includes("pdf")) servers.push("mcp-server-pdf");
  // Docker / container management
  if (/docker|容器|container/i.test(role)) servers.push("@anthropic/mcp-docker");
  // PostgreSQL
  if (/postgres|pg|关系.*数据/i.test(role)) servers.push("@modelcontextprotocol/server-postgres");
  // Brave search
  if (/搜索引擎|search.*engine/i.test(role)) servers.push("@anthropic/mcp-brave-search");

  return [...new Set(servers)];
}

// ── Memory Search Inference ──────────────────────────────────────────────

function inferMemorySearch(role: string, ctx: UserContext): InferredCapabilities["memorySearch"] {
  const needsMemory =
    /记忆|记录|知识|历史|memory|history|knowledge/i.test(role) ||
    ctx.resources.some((r) => ["faq_doc", "database", "notion"].includes(r)) ||
    ctx.scenario === "customer_support";

  return { enabled: needsMemory };
}

// ── Subagents Inference ──────────────────────────────────────────────────

function inferSubagents(role: string): InferredCapabilities["subagents"] | undefined {
  if (/分发|调度|管理|coordinator|dispatch|manager/i.test(role)) {
    return { maxDepth: 1 };
  }
  return undefined;
}

// ── Heartbeat Inference ──────────────────────────────────────────────────

function inferHeartbeat(
  role: string,
  ctx: UserContext,
): InferredCapabilities["heartbeat"] | undefined {
  if (/定时|提醒|定期|cron|schedule|remind/i.test(role) || ctx.scenario === "scheduling") {
    return { every: "24h", activeHours: { start: "09:00", end: "21:00" } };
  }
  return undefined;
}

// ── Dynamic Model Catalog Conversion ─────────────────────────────────────

/** Guess model tier from its id / metadata. */
function guessTier(m: { id: string; reasoning?: boolean; contextWindow?: number }): ModelTier {
  // SOTA flagships — check FIRST (higher priority than reasoning)
  if (/opus|gpt-5/i.test(m.id)) return "sota";
  // Reasoning / deep-think models → mid
  if (m.reasoning) return "mid";
  if (/reasoner|r1\b|o[13]\b|think/i.test(m.id)) return "mid";
  // Everything else → cheap
  return "cheap";
}

/** Default scenario affinity from model id heuristics. */
function guessAffinities(m: { id: string; reasoning?: boolean }): Record<string, number> {
  const base: Record<string, number> = { general: 7 };
  if (/code|coder|codex|coding/i.test(m.id)) {
    Object.assign(base, { coding: 9, data_analysis: 8 });
  }
  if (m.reasoning || /reasoner|r1\b|think/i.test(m.id)) {
    Object.assign(base, { coding: 9, data_analysis: 9, research: 8 });
  }
  if (/chat|turbo|lite|flash/i.test(m.id)) {
    Object.assign(base, { general: 8, content: 7, customer_support: 7 });
  }
  return base;
}

/**
 * Convert gateway ModelCatalogEntry[] to ModelCandidate[].
 *
 * Call this with the result of `callGateway("models.list", {})` to get
 * a dynamic model pool that replaces the static MODEL_CANDIDATES.
 *
 * Usage:
 *   const res = await callGateway("models.list", {});
 *   const models = catalogToCandidate(res?.models ?? []);
 *   inferAgentCapabilities(bp, ctx, config, discovery, models);
 */
/** Pattern for image-only model IDs that should NOT be used as text agent models. */
const IMAGE_ONLY_MODEL_PATTERN =
  /dall-e|gpt-image|wanx|wan-x|wan2|stable-diffusion|flux|midjourney|imagen/i;

// ── Cross-provider model dedup ──────────────────────────────────────────
//
// Different providers host the same upstream model under different IDs.
// E.g. DeepSeek V3 is "deepseek-chat" on deepseek, "deepseek-ai/DeepSeek-V3"
// on siliconflow/huggingface. Without dedup, the same logical model takes
// multiple slots in the candidate pool, crowding out genuinely different models
// and producing fake "fallbacks" that are really the same model.
//
// Strategy: extract a canonical fingerprint from the model ID, keep only the
// first occurrence per fingerprint (first = earlier in catalog = native provider
// or user's primary provider).

/** Extract canonical model fingerprint, e.g. "deepseek-v3", "qwen-max". */
function canonicalModelFingerprint(modelId: string): string {
  const lower = modelId
    .toLowerCase()
    // Strip org prefix: "deepseek-ai/DeepSeek-V3" → "deepseek-v3"
    .replace(/^[a-z0-9_-]+\//i, "")
    // Normalize separators
    .replace(/[_\s]+/g, "-");

  // Known aliases: same upstream model, different commercial names
  // deepseek-chat (native API) = deepseek-v3 (siliconflow/huggingface naming)
  if (lower === "deepseek-chat" || lower === "deepseek-v3") return "deepseek-v3";
  if (lower === "deepseek-reasoner" || lower === "deepseek-r1") return "deepseek-r1";
  // qwen variants: "qwen-turbo-latest" → "qwen-turbo"
  const qwenBase = lower.match(/^(qwen-(?:turbo|plus|max|vl-max))(?:-latest)?$/);
  if (qwenBase) return qwenBase[1];
  // glm variants
  if (lower === "glm-4-plus" || lower === "chatglm-4-plus") return "glm-4-plus";
  if (lower === "glm-5" || lower === "chatglm-5") return "glm-5";

  return lower;
}

export function catalogToCandidate(
  entries: Array<{
    id: string;
    name?: string;
    provider: string;
    contextWindow?: number;
    reasoning?: boolean;
    input?: Array<string>;
  }>,
): ModelCandidate[] {
  const seen = new Set<string>();

  return (
    entries
      .filter((e) => e.provider && e.id)
      // Exclude image-only models (no text input, or known image-gen model IDs)
      .filter((e) => {
        if (IMAGE_ONLY_MODEL_PATTERN.test(e.id)) return false;
        if (e.input && e.input.length > 0 && !e.input.includes("text")) return false;
        return true;
      })
      // Cross-provider dedup: keep first occurrence per canonical fingerprint
      .filter((e) => {
        const fp = canonicalModelFingerprint(e.id);
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      })
      .map((e) => ({
        fullId: `${e.provider}/${e.id}`,
        provider: e.provider,
        modelId: e.id,
        contextWindow: e.contextWindow ?? 32000,
        tier: guessTier(e),
        affinities: guessAffinities(e),
      }))
  );
}
