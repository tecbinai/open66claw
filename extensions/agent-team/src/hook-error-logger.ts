/**
 * Hook Error Logger — Deduplicating error logger for plugin hooks.
 *
 * Same error class from the same hook → suppressed for ttlMs after first
 * occurrence. Every summaryInterval suppressions → a single warn summary.
 *
 * Migrated from clawdbot extensions/agent-team/src/hook-error-logger.ts
 */

type LogSink = {
  error: (msg: string) => void;
  warn: (msg: string) => void;
};

type HookErrorLoggerConfig = {
  ttlMs: number;
  maxSize: number;
  summaryInterval: number;
};

type SuppressionEntry = {
  firstAt: number;
  count: number;
};

export function createHookErrorLogger(sink: LogSink, config: HookErrorLoggerConfig) {
  const suppressions = new Map<string, SuppressionEntry>();

  function makeKey(hook: string, err: unknown): string {
    const className =
      err instanceof Error ? err.constructor.name : typeof err === "string" ? "string" : "unknown";
    return `${hook}:${className}`;
  }

  function formatMessage(hook: string, err: unknown, extra?: string): string {
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
    return `[${hook}] ${msg}${extra ?? ""}`;
  }

  return {
    log(hook: string, err: unknown, extra?: string): void {
      const key = makeKey(hook, err);
      const now = Date.now();
      const existing = suppressions.get(key);

      if (existing && now - existing.firstAt < config.ttlMs) {
        existing.count++;
        if (existing.count % config.summaryInterval === 0) {
          sink.warn(
            `[${hook}] Suppressed ${existing.count} repeated ${err instanceof Error ? err.constructor.name : "error"}(s)`,
          );
        }
        return;
      }

      // Evict oldest if at capacity
      if (suppressions.size >= config.maxSize) {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [k, v] of suppressions) {
          if (v.firstAt < oldestTime) {
            oldestTime = v.firstAt;
            oldestKey = k;
          }
        }
        if (oldestKey) suppressions.delete(oldestKey);
      }

      suppressions.set(key, { firstAt: now, count: 0 });
      sink.error(formatMessage(hook, err, extra));
    },

    suppressCount(hook: string, errorClass: string): number {
      const key = `${hook}:${errorClass}`;
      return suppressions.get(key)?.count ?? 0;
    },

    clear(): void {
      suppressions.clear();
    },
  };
}
