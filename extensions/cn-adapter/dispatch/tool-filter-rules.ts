/**
 * Tool Filter Rules — Intent → Tool 映射表 + 过滤策略
 *
 * 当 dispatch 识别出用户意图后，只保留核心工具 + 该意图相关的工具，
 * 将闲聊场景的工具开销从 ~20K 降到 ~4-6K tokens。
 *
 * 执行顺序（before_tool_call hook 链）：
 *   1. tool-filter (priority:100) — 本模块，业务过滤
 *   2. search-fallback (priority:90) — 搜索降级
 *   3. security-tier (priority:50) — 安全兜底，最后防线
 */

// ============================================================================
// Types
// ============================================================================

export type ToolFilterMode = "off" | "intent";

export type ToolFilterPolicy = {
  /** 允许保留的工具名（已 normalize） */
  allow: Set<string>;
  /** 通配符前缀（如 "mcp_database_"） */
  allowPrefixes: string[];
  /** 产生此策略的模式 */
  mode: ToolFilterMode;
};

// ============================================================================
// 核心工具集 — 永远不被过滤
// ============================================================================

export const CORE_ALWAYS_ON_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "glob",
  "grep",
  "memory_search",
  "memory_get",
]);

// ============================================================================
// Intent → Tool 映射表
// ============================================================================

/**
 * 每个意图允许使用的额外工具列表。
 * 使用 "group:" 前缀表示工具组，通配符仅支持尾部形式（如 "mcp_database_*"）。
 */
export const INTENT_TOOL_MAP: Record<string, string[]> = {
  general: ["web_search", "web_fetch", "sessions_spawn", "message"],
  coding: ["web_search", "web_fetch", "sessions_spawn", "apply_patch", "process", "image"],
  wechat_operation: [
    "wechat_send",
    "wechat_read",
    "wechat_check",
    "wecom_send",
    "wecom_read",
    "message",
    "sessions_spawn",
  ],
  desktop_control: ["desktop_control", "open_app", "browser", "canvas"],
  image_generation: ["image", "image_gen", "message"],
  video_generation: ["video_gen", "video_understand", "message"],
  video_understanding: ["video_understand", "image", "message"],
  database_query: ["mcp_database_*"],
  web_browsing: ["web_search", "web_fetch", "browser"],
  audio_processing: ["tts", "message"],
};

// ============================================================================
// Build filter policy
// ============================================================================

/**
 * 从用户意图构建过滤策略。
 * 返回 undefined 表示不过滤（mode=off / 未知意图）。
 */
export function buildToolFilterPolicy(
  intent: string | undefined,
  mode: ToolFilterMode,
): ToolFilterPolicy | undefined {
  if (!intent || mode === "off") return undefined;

  // 1. 核心工具
  const allow = new Set<string>(CORE_ALWAYS_ON_TOOLS);
  const allowPrefixes: string[] = [];

  // 2. 意图相关工具
  const intentTools = INTENT_TOOL_MAP[intent] ?? INTENT_TOOL_MAP["general"]!;
  for (const tool of intentTools) {
    if (tool.endsWith("*")) {
      allowPrefixes.push(tool.slice(0, -1)); // "mcp_database_*" → "mcp_database_"
    } else {
      allow.add(tool);
    }
  }

  // 安全守卫：allow 集太小时不过滤
  if (allow.size + allowPrefixes.length < 5) return undefined;

  return { allow, allowPrefixes, mode };
}

// ============================================================================
// Apply filter
// ============================================================================

/**
 * 判断某个工具是否被策略允许。
 */
export function isToolAllowed(toolName: string, policy: ToolFilterPolicy | undefined): boolean {
  if (!policy) return true;
  if (policy.allow.has(toolName)) return true;
  for (const prefix of policy.allowPrefixes) {
    if (toolName.startsWith(prefix)) return true;
  }
  return false;
}
