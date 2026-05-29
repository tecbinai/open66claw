/**
 * Execution Workspace — in-memory context store for DAG step communication.
 *
 * Each DAG execution creates a workspace instance. Steps write outputs to the
 * workspace, and downstream steps read prior outputs for context injection.
 *
 * Ported from clawdbot's execution-workspace.ts — pure in-memory Map, no
 * external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepOutputStatus = "ok" | "error" | "skipped" | "timeout";

export type StepOutput = {
  status: StepOutputStatus;
  output: string;
  durationMs: number;
  /** Optional structured data for downstream consumption. */
  data?: Record<string, unknown>;
};

export type ExecutionWorkspace = {
  /** Store a step's output. */
  setOutput(stepId: string, output: StepOutput): void;
  /** Retrieve a step's output (undefined if step has not executed). */
  getOutput(stepId: string): StepOutput | undefined;
  /** Snapshot of all outputs as a plain object. */
  getAllOutputs(): Record<string, StepOutput>;
  /** Number of stored step outputs. */
  size(): number;
  /**
   * Resolve template references in a string.
   *
   * Supported patterns:
   *   {{step_id.output}}     — the step's text output
   *   {{step_id.status}}     — "ok" | "error" | "skipped" | "timeout"
   *   {{step_id.durationMs}} — execution time in milliseconds
   *
   * Missing references are preserved with a `:not_found` suffix.
   */
  resolveTemplates(template: string): string;
};

// ---------------------------------------------------------------------------
// Template regex — matches {{word.field}}
// ---------------------------------------------------------------------------

const TEMPLATE_RE = /\{\{(\w+)\.(output|status|durationMs)\}\}/g;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkspace(): ExecutionWorkspace {
  const outputs = new Map<string, StepOutput>();

  return {
    setOutput(stepId: string, output: StepOutput): void {
      outputs.set(stepId, output);
    },

    getOutput(stepId: string): StepOutput | undefined {
      return outputs.get(stepId);
    },

    getAllOutputs(): Record<string, StepOutput> {
      const obj: Record<string, StepOutput> = {};
      for (const [key, value] of outputs) {
        obj[key] = value;
      }
      return obj;
    },

    size(): number {
      return outputs.size;
    },

    resolveTemplates(template: string): string {
      return template.replace(TEMPLATE_RE, (_match, stepId: string, field: string) => {
        const out = outputs.get(stepId);
        if (!out) return `{{${stepId}.${field}:not_found}}`;
        switch (field) {
          case "output":
            return out.output;
          case "status":
            return out.status;
          case "durationMs":
            return String(out.durationMs);
          default:
            return `{{${stepId}.${field}:unknown_field}}`;
        }
      });
    },
  };
}
