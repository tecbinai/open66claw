/**
 * Conversation Compactor — Activity Summary for Supervisor Context
 *
 * Provides the supervisor with a compact view of recent team activity,
 * enabling better routing decisions and context-aware handoffs.
 *
 * Design principles:
 *   - Zero LLM cost: pure rule-based formatting
 *   - Budget-controlled: hard character limit (500 chars)
 *   - Lightweight: only recent events, no disk I/O
 *
 * Migrated from clawdbot extensions/agent-team/src/conversation-compactor.ts
 */

// ── Constants ────────────────────────────────────────────────────────────

/** Max characters for the activity summary injected into supervisor context. */
const ACTIVITY_SUMMARY_MAX_CHARS = 500;

/** Max number of recent events to include in the summary. */
const ACTIVITY_SUMMARY_MAX_EVENTS = 5;

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Minimal shape of an activity event — avoids importing the full
 * ActivityEvent type from index.ts (which is a module-local type).
 */
export type ActivityEventLike = {
  readonly agentId: string;
  readonly method?: string;
  readonly durationMs?: number;
  readonly success?: boolean;
  readonly error?: string;
  readonly taskType?: string;
  readonly outcome?: string;
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Format recent activity events into a compact summary string
 * for injection into the supervisor's system prompt.
 *
 * @param events   - Activity event buffer (newest last)
 * @param agentNames - Map of agentId → display name for readability
 * @param limit    - Max events to include (default: 5)
 * @returns Formatted summary string, or empty string if no events
 */
export function formatActivitySummary(
  events: ActivityEventLike[],
  agentNames: Map<string, string>,
  limit: number = ACTIVITY_SUMMARY_MAX_EVENTS,
): string {
  if (!events || events.length === 0) return "";

  // Take the most recent N events (buffer is oldest-first)
  const recent = events.slice(-limit);

  const lines: string[] = [];
  for (const evt of recent) {
    const name = agentNames.get(evt.agentId) ?? shortId(evt.agentId);
    const duration = evt.durationMs != null ? ` (${formatDuration(evt.durationMs)})` : "";
    const status = formatOutcome(evt);
    const method = evt.method ? ` via ${evt.method}` : "";

    lines.push(`${name}${method}: ${status}${duration}`);
  }

  const summary = `Recent team activity:\n${lines.join("\n")}`;

  // Hard truncate if exceeds budget
  if (summary.length > ACTIVITY_SUMMARY_MAX_CHARS) {
    return summary.slice(0, ACTIVITY_SUMMARY_MAX_CHARS - 3) + "...";
  }

  return summary;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Sanitize a string for safe injection into system prompt context.
 * Strips XML/HTML tags and common prompt injection patterns.
 */
function sanitizeForPrompt(s: string): string {
  return s
    .replace(/[<>]/g, "") // strip XML angle brackets
    .replace(/\n/g, " ") // collapse newlines
    .replace(/\s{2,}/g, " ") // collapse whitespace
    .trim();
}

/**
 * Format an event's outcome into a human-readable status string.
 */
function formatOutcome(evt: ActivityEventLike): string {
  // Prefer the new structured outcome field
  if (evt.outcome) {
    switch (evt.outcome) {
      case "success":
        return "completed";
      case "failure":
        return evt.error ? `failed (${sanitizeForPrompt(truncate(evt.error, 40))})` : "failed";
      case "timeout":
        return "timed out";
      case "partial":
        return "partial result";
      default:
        return sanitizeForPrompt(evt.outcome);
    }
  }

  // Fall back to boolean success field
  if (evt.success === false) {
    return evt.error ? `failed (${sanitizeForPrompt(truncate(evt.error, 40))})` : "failed";
  }
  return "completed";
}

/**
 * Format milliseconds into a human-friendly duration string.
 */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Extract a short readable name from an agent ID.
 * e.g. "proj-20260228-abc--member-sales" → "member-sales"
 */
function shortId(agentId: string): string {
  const parts = agentId.split("--");
  const raw = parts.length > 1 ? parts[parts.length - 1] : agentId;
  return sanitizeForPrompt(raw);
}

/**
 * Truncate a string to maxLen characters with ellipsis.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}
