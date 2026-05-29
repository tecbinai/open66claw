/**
 * memory_share Tool — Proactive cross-agent memory sharing.
 *
 * Allows an agent to share important user facts, identity details, or
 * preferences with all other team members via the shared memory pool.
 *
 * Only available when the project uses "read-shared" memory mode.
 *
 * Migrated from clawdbot extensions/agent-team/src/memory-share-tool.ts
 * Changes:
 *   - Removed openclawcn/plugin-sdk dependency
 *   - Uses @sinclair/typebox directly (available in upstream deps)
 *   - Defines lightweight AnyAgentTool / jsonResult locally
 */

import { Type } from "@sinclair/typebox";
import {
  withSharedProfileLock,
  upsertSharedEntry,
  SHARED_MAX_KEY_LENGTH,
  SHARED_MAX_VALUE_LENGTH,
} from "./shared-profile-store.js";
import type { SharedCategory } from "./types.js";

// ── Lightweight Tool Types (avoid SDK dependency) ────────────────────────

/**
 * Minimal agent tool interface compatible with OpenClaw's tool system.
 * Avoids importing from src/agents/tools/common.ts (internal path).
 */
export type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

export type MemoryShareTool = {
  label: string;
  name: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, toolParams: Record<string, unknown>) => Promise<AgentToolResult>;
};

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ── Schema & Constants ───────────────────────────────────────────────────

const VALID_CATEGORIES: SharedCategory[] = ["fact", "identity", "preference"];

const MemoryShareSchema = Type.Object({
  category: Type.Union(VALID_CATEGORIES.map((c) => Type.Literal(c))),
  key: Type.String(),
  value: Type.String(),
});

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Create a memory_share tool bound to a specific project and agent.
 */
export function createMemoryShareTool(params: {
  projectId: string;
  agentId: string;
}): MemoryShareTool {
  const { projectId, agentId } = params;

  return {
    label: "Team Memory Share",
    name: "memory_share",
    description: [
      "Share an important user fact, identity detail, or preference with your team.",
      "Other team members will see this information in their context.",
      "Use when you learn something about the user that the whole team should know.",
      "Categories: fact (user facts), identity (name, role, company), preference (likes/dislikes).",
      "Do NOT share: trivial info, one-time instructions, or private/sensitive data (phone, address).",
    ].join(" "),
    parameters: MemoryShareSchema,
    execute: async (_toolCallId, toolParams) => {
      const category = toolParams.category as SharedCategory;
      const rawKey = typeof toolParams.key === "string" ? toolParams.key.trim() : "";
      const value = typeof toolParams.value === "string" ? toolParams.value.trim() : "";

      if (!rawKey || !value) {
        return jsonResult({
          success: false,
          error: "key and value are required",
        });
      }
      if (!VALID_CATEGORIES.includes(category)) {
        return jsonResult({
          success: false,
          error: `invalid category: ${category}. Valid: ${VALID_CATEGORIES.join(", ")}`,
        });
      }
      if (rawKey.length > SHARED_MAX_KEY_LENGTH) {
        return jsonResult({
          success: false,
          error: `key too long (max ${SHARED_MAX_KEY_LENGTH} chars)`,
        });
      }
      if (value.length > SHARED_MAX_VALUE_LENGTH) {
        return jsonResult({
          success: false,
          error: `value too long (max ${SHARED_MAX_VALUE_LENGTH} chars)`,
        });
      }

      try {
        const totalEntries = await withSharedProfileLock(projectId, (profile) => {
          const updated = upsertSharedEntry(profile, {
            category,
            key: rawKey,
            value,
            sourceAgentId: agentId,
          });
          return { profile: updated, result: updated.entries.length };
        });

        return jsonResult({
          success: true,
          category,
          key: rawKey,
          shared: true,
          totalSharedEntries: totalEntries,
        });
      } catch (err) {
        return jsonResult({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
