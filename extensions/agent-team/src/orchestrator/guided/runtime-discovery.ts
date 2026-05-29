/**
 * Runtime Capability Discovery
 *
 * Discovers actually installed skills and running MCP servers at runtime,
 * then uses semantic matching to recommend the best capabilities for each agent role.
 *
 * Replaces the static keyword→skill/MCP mapping in capability-inference.ts
 * with real-time discovery from the skill/MCP registries.
 *
 * Limits: max 5 skills per agent, max 7 MCP servers per agent.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type DiscoveredSkill = {
  name: string;
  description: string;
  source: "bundled" | "managed" | "workspace" | "personal" | "project" | "extra";
};

export type DiscoveredMCPTool = {
  name: string;
  description: string;
};

export type DiscoveredMCPServer = {
  id: string;
  enabled: boolean;
  running: boolean;
  tools: DiscoveredMCPTool[];
};

export type DiscoveryResult = {
  skills: DiscoveredSkill[];
  mcpServers: DiscoveredMCPServer[];
  timestamp: number;
};

export type CapabilityMatchResult = {
  skills: string[]; // max 5
  mcpServers: string[]; // max 7
  confidence: number; // 0-1
};

// ── Constants ────────────────────────────────────────────────────────────

export const MAX_SKILLS_PER_AGENT = 5;
export const MAX_MCP_PER_AGENT = 7;
const DISCOVERY_CACHE_TTL_MS = 60_000; // 60 seconds

// ── Discovery Cache ──────────────────────────────────────────────────────

let cachedDiscovery: DiscoveryResult | null = null;

function isCacheValid(): boolean {
  if (!cachedDiscovery) return false;
  return Date.now() - cachedDiscovery.timestamp < DISCOVERY_CACHE_TTL_MS;
}

/**
 * Invalidate the discovery cache (e.g., after installing a new skill).
 */
export function invalidateDiscoveryCache(): void {
  cachedDiscovery = null;
}

// ── Skill Discovery ──────────────────────────────────────────────────────

/**
 * Discover all installed skills by loading from the skill workspace.
 * Uses lazy dynamic import to avoid hard dependency on src/agents/skills.
 */
async function discoverInstalledSkills(workspaceDir?: string): Promise<DiscoveredSkill[]> {
  if (!workspaceDir) return [];
  try {
    // Use require() instead of dynamic import — bytenode/CJS env does not support await import()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadWorkspaceSkillEntries } =
      require("../../../../dist/agents/skills.js") as typeof import("../../../../dist/agents/skills.js");
    const entries = loadWorkspaceSkillEntries(workspaceDir);
    return entries
      .map((entry) => ({
        name: entry.skill.name ?? "",
        description: entry.skill.description ?? "",
        source:
          ((entry.metadata as Record<string, unknown> | undefined)
            ?.source as DiscoveredSkill["source"]) ?? "bundled",
      }))
      .filter((s: DiscoveredSkill) => s.name.length > 0);
  } catch {
    // Skills module not available (e.g., during tests or if not bundled)
    return [];
  }
}

// ── MCP Discovery ────────────────────────────────────────────────────────

/**
 * Discover all configured MCP servers and their tools.
 * Uses lazy dynamic import to avoid hard dependency on src/mcp.
 */
async function discoverMCPServers(): Promise<DiscoveredMCPServer[]> {
  try {
    // Use require() instead of dynamic import — bytenode/CJS env does not support await import()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMCPManagerSafe } =
      require("../../../../dist/mcp/index.js") as typeof import("../../../../dist/mcp/index.js");
    const manager = getMCPManagerSafe();
    if (!manager) return [];

    const status = manager.getStatus();
    return (status.servers ?? []).map(
      (server: {
        config: { id: string; enabled: boolean };
        status: string;
        tools?: Array<{ name: string; description?: string }>;
      }) => ({
        id: server.config.id,
        enabled: server.config.enabled,
        running: server.status === "running",
        tools: (server.tools ?? []).map((t: { name: string; description?: string }) => ({
          name: t.name,
          description: t.description ?? "",
        })),
      }),
    );
  } catch {
    // MCP module not available
    return [];
  }
}

// ── Combined Discovery ───────────────────────────────────────────────────

/**
 * Discover all available capabilities (skills + MCP servers).
 * Results are cached for 60 seconds to avoid repeated disk/IPC calls.
 */
export async function discoverAll(workspaceDir?: string): Promise<DiscoveryResult> {
  if (isCacheValid() && cachedDiscovery) {
    return cachedDiscovery;
  }

  const [skills, mcpServers] = await Promise.all([
    discoverInstalledSkills(workspaceDir),
    discoverMCPServers(),
  ]);

  cachedDiscovery = { skills, mcpServers, timestamp: Date.now() };
  return cachedDiscovery;
}

// ── Semantic Matching ────────────────────────────────────────────────────

/**
 * Score how well a skill matches an agent's role/scenario.
 * Returns 0-1 confidence score based on keyword overlap.
 * Uses deduplicated tokens to prevent 2-gram sub-tokens from inflating scores.
 */
function scoreSkillMatch(skill: DiscoveredSkill, role: string, scenario: string): number {
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();
  const roleWords = tokenizeForMatching(role);
  const scenarioWords = tokenizeForMatching(scenario);

  // Deduplicate: only count each unique token once for scoring
  const uniqueRoleWords = [...new Set(roleWords)];
  const uniqueScenarioWords = [...new Set(scenarioWords)];

  if (uniqueRoleWords.length === 0 && uniqueScenarioWords.length === 0) return 0;

  let matchCount = 0;

  for (const word of uniqueRoleWords) {
    if (haystack.includes(word)) matchCount += 2; // Role words weighted higher
  }
  for (const word of uniqueScenarioWords) {
    if (haystack.includes(word)) matchCount += 1;
  }

  // Normalize — 2 points per role word, 1 per scenario word
  const maxScore = uniqueRoleWords.length * 2 + uniqueScenarioWords.length;
  return maxScore > 0 ? Math.min(matchCount / maxScore, 1) : 0;
}

/**
 * Score how well an MCP server matches an agent's role.
 */
function scoreMCPMatch(server: DiscoveredMCPServer, role: string): number {
  // Match against server ID + all tool names/descriptions
  const parts = [server.id, ...server.tools.map((t) => `${t.name} ${t.description}`)];
  const haystack = parts.join(" ").toLowerCase();
  const roleWords = tokenizeForMatching(role);

  if (roleWords.length === 0) return 0;

  let matchCount = 0;
  for (const word of roleWords) {
    if (haystack.includes(word)) matchCount++;
  }

  return Math.min(matchCount / roleWords.length, 1);
}

/**
 * Tokenize text for matching. Handles both CJK and Latin text.
 * Filters stop words and returns meaningful tokens.
 * CJK: extracts contiguous segments and also generates 2-gram sub-tokens
 * for better matching (e.g., "数据分析" → ["数据分析", "数据", "分析"]).
 */
function tokenizeForMatching(text: string): string[] {
  const lower = text.toLowerCase();

  // Extract CJK segments (1+ chars) and generate 2-gram sub-tokens
  const cjkSegments = lower.match(/[\u4e00-\u9fff]+/g) ?? [];
  const cjkTokens: string[] = [];
  for (const seg of cjkSegments) {
    if (seg.length >= 2) {
      cjkTokens.push(seg);
      // For segments ≥ 3 chars, also add 2-char sub-tokens
      if (seg.length >= 3) {
        for (let i = 0; i < seg.length - 1; i++) {
          cjkTokens.push(seg.slice(i, i + 2));
        }
      }
    }
  }
  const latinMatches = lower.match(/[a-z][a-z0-9_-]{2,}/g) ?? [];

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "was",
    "not",
    "can",
    "will",
    "but",
    "all",
    "each",
    "into",
    "over",
    "also",
    "use",
    "how",
    "的",
    "和",
    "在",
    "是",
    "了",
    "有",
    "不",
    "人",
    "我",
    "他",
    "她",
    "们",
    "这",
    "那",
    "个",
    "上",
    "下",
    "把",
    "被",
    "让",
    "给",
    "对",
    "到",
    "agent",
    "助手",
    "负责",
    "进行",
    "工作",
  ]);

  return Array.from(new Set([...cjkTokens, ...latinMatches])).filter((w) => !stopWords.has(w));
}

// ── Public Matching API ──────────────────────────────────────────────────

/**
 * Match available capabilities to an agent role using semantic scoring.
 *
 * Returns the top skills (max 5) and MCP servers (max 7) sorted by relevance.
 * Falls back gracefully if discovery returned empty results.
 */
export function matchCapabilitiesToRole(
  role: string,
  scenario: string,
  discovery: DiscoveryResult,
): CapabilityMatchResult {
  // Score and rank skills
  const scoredSkills = discovery.skills
    .map((skill) => ({ skill, score: scoreSkillMatch(skill, role, scenario) }))
    .filter((s) => s.score > 0.05) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SKILLS_PER_AGENT);

  // Score and rank MCP servers (only consider running ones)
  const scoredMCP = discovery.mcpServers
    .filter((s) => s.enabled && s.running)
    .map((server) => ({ server, score: scoreMCPMatch(server, role) }))
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MCP_PER_AGENT);

  // Overall confidence: average of top matches
  const allScores = [...scoredSkills.map((s) => s.score), ...scoredMCP.map((s) => s.score)];
  const confidence =
    allScores.length > 0 ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length : 0;

  return {
    skills: scoredSkills.map((s) => s.skill.name),
    mcpServers: scoredMCP.map((s) => s.server.id),
    confidence,
  };
}

/**
 * Merge runtime-discovered capabilities with static inference results.
 *
 * Strategy:
 * - If runtime confidence is high (≥0.3), runtime results take priority, static fills gaps.
 * - If runtime confidence is low (<0.3), static results take priority, runtime fills gaps.
 *   This prevents low-relevance runtime matches from displacing targeted static recommendations.
 * - Always respects limits (5 skills, 7 MCP).
 */
export function mergeWithStaticInference(
  runtimeMatch: CapabilityMatchResult,
  staticSkills: string[],
  staticMCP: string[],
): { skills: string[]; mcpServers: string[] } {
  const CONFIDENCE_THRESHOLD = 0.3;
  const runtimeFirst = runtimeMatch.confidence >= CONFIDENCE_THRESHOLD;

  const primarySkills = runtimeFirst ? runtimeMatch.skills : staticSkills;
  const secondarySkills = runtimeFirst ? staticSkills : runtimeMatch.skills;
  const primaryMCP = runtimeFirst ? runtimeMatch.mcpServers : staticMCP;
  const secondaryMCP = runtimeFirst ? staticMCP : runtimeMatch.mcpServers;

  const skills = [...primarySkills];
  for (const s of secondarySkills) {
    if (skills.length >= MAX_SKILLS_PER_AGENT) break;
    if (!skills.includes(s)) skills.push(s);
  }

  const mcpServers = [...primaryMCP];
  for (const m of secondaryMCP) {
    if (mcpServers.length >= MAX_MCP_PER_AGENT) break;
    if (!mcpServers.includes(m)) mcpServers.push(m);
  }

  return {
    skills: skills.slice(0, MAX_SKILLS_PER_AGENT),
    mcpServers: mcpServers.slice(0, MAX_MCP_PER_AGENT),
  };
}
