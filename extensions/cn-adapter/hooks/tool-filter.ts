import {
  buildToolFilterPolicy,
  isToolAllowed,
  type ToolFilterMode,
} from "../dispatch/tool-filter-rules.js";
import { createCnLogger } from "../utils/index.js";
import type { CnPluginConfig } from "./cn-config.js";

const log = createCnLogger("dispatch:filter");

/**
 * 工具过滤 handler — 基于 dispatch 规则的业务过滤。
 *
 * 执行顺序（before_tool_call hook 链）：
 *   1. tool-filter (priority:100) — 本 handler，业务过滤
 *   2. search-fallback (priority:90) — 搜索降级
 *   3. security-tier (priority:50) — 安全兜底，最后防线
 *
 * 注意：安全三档拦截由 security-tier.ts (priority:50) 负责，
 * 本 handler 只做非安全相关的业务层过滤。
 */

// ── 按 runId 隔离的 dispatch 意图缓存 ──────────────────────────────────
// 多个 agent（subagent）共享同一 Node 进程，
// 用 runId 做 key 避免 agent A 的意图污染 agent B。
type IntentEntry = { intent: string; mode: ToolFilterMode };
const _intentByRun = new Map<string, IntentEntry>();

/** 默认 runId，供无 runId 场景（单 agent / 测试）使用 */
const DEFAULT_RUN = "__default__";

/**
 * 设置当前 dispatch 意图（由 prompt-inject hook 在 before_prompt_build 时调用）。
 */
export function setDispatchIntent(
  intent: string,
  mode: ToolFilterMode = "intent",
  runId?: string,
): void {
  _intentByRun.set(runId ?? DEFAULT_RUN, { intent, mode });
}

/**
 * 清除缓存的 dispatch 意图。
 */
export function clearDispatchIntent(runId?: string): void {
  if (runId) {
    _intentByRun.delete(runId);
  } else {
    _intentByRun.clear();
  }
}

export function createToolFilterHandler(getConfig: () => CnPluginConfig) {
  return async (event: { toolName: string; params: Record<string, unknown>; runId?: string }) => {
    const config = getConfig();

    // 如果配置了 dispatch 模式为 off，跳过过滤
    const configMode = config.toolFilterMode;

    // 按 runId 查找意图缓存
    const entry = _intentByRun.get(event.runId ?? DEFAULT_RUN);
    const effectiveMode = configMode ?? entry?.mode ?? "off";

    if (effectiveMode === "off") return undefined;

    const cachedIntent = entry?.intent;

    // 构建过滤策略
    const policy = buildToolFilterPolicy(cachedIntent, effectiveMode);
    if (!policy) return undefined;

    // 判断当前工具是否被允许
    if (!isToolAllowed(event.toolName, policy)) {
      log.debug(`dispatch 过滤: ${event.toolName} 不在意图 "${cachedIntent}" 的允许列表中`);
      return {
        block: true,
        blockReason:
          `工具 ${event.toolName} 不在当前意图 "${cachedIntent ?? "unknown"}" 的允许范围内。` +
          `如需使用，请在配置中设置 toolFilterMode: "off" 或调整意图映射。`,
      };
    }

    return undefined;
  };
}
