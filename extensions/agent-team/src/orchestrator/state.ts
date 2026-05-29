/**
 * Orchestration State Manager
 *
 * Manages the lifecycle of orchestration plans: creation, deployment tracking,
 * status queries, and rollback.
 *
 * Storage: JSON files under ~/.openclaw/orchestrator/plans/{planId}.json
 * This is intentionally simple — no database, no Redis. Just files.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentDeployState, OrchestrationPlan, OrchestrationState } from "./types.js";

/** Windows-safe atomic rename: rename, fallback to copy+unlink on EPERM/EBUSY. */
async function safeRename(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch {
    try {
      await fs.copyFile(src, dest);
    } catch (copyErr) {
      await fs.unlink(src).catch(() => {});
      throw copyErr;
    }
    await fs.unlink(src).catch(() => {});
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

// ── State Directory ──────────────────────────────────────────────────────

let stateDir = "";

/**
 * Initialize the state directory. Must be called before any state operations.
 */
export function initStateDir(dir: string): void {
  stateDir = dir;
}

function ensureStateDir(): string {
  if (!stateDir) {
    throw new Error("Orchestrator state directory not initialized. Call initStateDir() first.");
  }
  return stateDir;
}

/**
 * Validate planId to prevent path traversal attacks.
 * Only allows: alphanumeric, hyphens, underscores (matching orch-{date}-{hex} format).
 */
function sanitizePlanId(planId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    throw new Error(
      `Invalid planId: "${planId}" — must contain only alphanumeric, hyphens, underscores`,
    );
  }
  return planId;
}

function planPath(planId: string): string {
  return path.join(ensureStateDir(), "plans", `${sanitizePlanId(planId)}.json`);
}

function statePath(planId: string): string {
  return path.join(ensureStateDir(), "states", `${sanitizePlanId(planId)}.json`);
}

// ── Atomic Write Helper ───────────────────────────────────────────────────

/**
 * Write JSON to a file atomically: write to tmp, then rename.
 * Prevents data corruption if the process crashes mid-write.
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, content, "utf-8");
  await safeRename(tmpPath, filePath);
}

// ── Plan Storage ─────────────────────────────────────────────────────────

/**
 * Save an orchestration plan.
 */
export async function savePlan(plan: OrchestrationPlan): Promise<void> {
  await atomicWriteJson(planPath(plan.planId), plan);
}

/**
 * Load an orchestration plan by id.
 */
export async function loadPlan(planId: string): Promise<OrchestrationPlan | null> {
  try {
    const raw = await fs.readFile(planPath(planId), "utf-8");
    return JSON.parse(raw) as OrchestrationPlan;
  } catch (err: unknown) {
    // File not found is expected — return null silently
    if (isFileNotFound(err)) return null;
    // JSON corruption or permission error — log and return null
    console.error(`[orchestrator] failed to load plan "${planId}":`, err);
    return null;
  }
}

/**
 * List all saved plan ids.
 */
export async function listPlanIds(): Promise<string[]> {
  const dir = path.join(ensureStateDir(), "plans");
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

// ── Deployment State ─────────────────────────────────────────────────────

/**
 * Save deployment state.
 */
export async function saveState(state: OrchestrationState): Promise<void> {
  await atomicWriteJson(statePath(state.planId), state);
}

/**
 * Load deployment state.
 */
export async function loadState(planId: string): Promise<OrchestrationState | null> {
  try {
    const raw = await fs.readFile(statePath(planId), "utf-8");
    return JSON.parse(raw) as OrchestrationState;
  } catch (err: unknown) {
    if (isFileNotFound(err)) return null;
    console.error(`[orchestrator] failed to load state "${planId}":`, err);
    return null;
  }
}

/**
 * Create initial deployment state from a plan.
 * agentId in the state matches the blueprint's local ID (for status tracking).
 * The actual deployed (namespaced) ID is constructed at deploy time.
 */
export function createInitialState(plan: OrchestrationPlan): OrchestrationState {
  const agents: AgentDeployState[] = plan.agents.map((bp) => ({
    agentId: bp.id,
    blueprintId: bp.id,
    status: "pending",
  }));

  // Default status depends on mode:
  //   guided → draft (allows iterative refinement)
  //   manual/template → confirming (legacy flow)
  const defaultStatus = plan.mode === "guided" ? "draft" : "confirming";

  return {
    planId: plan.planId,
    status: defaultStatus,
    agents,
  };
}

/**
 * Update the status of a specific agent in the deployment state.
 */
export function updateAgentStatus(
  state: OrchestrationState,
  agentId: string,
  status: AgentDeployState["status"],
  error?: string,
): OrchestrationState {
  const agents = state.agents.map((a) => {
    if (a.agentId !== agentId) return a;
    return {
      ...a,
      status,
      // Only overwrite error if explicitly provided or transitioning to failed
      error: error !== undefined ? error : status === "failed" ? a.error : undefined,
      ...(status === "ready" ? { readyAt: new Date().toISOString() } : {}),
    };
  });

  // Compute overall status
  const allReady = agents.every((a) => a.status === "ready");
  const anyFailed = agents.some((a) => a.status === "failed");

  let overallStatus = state.status;
  if (state.status === "deploying") {
    if (allReady) overallStatus = "deployed";
    else if (anyFailed) overallStatus = "failed";
  }

  return {
    ...state,
    agents,
    status: overallStatus,
    ...(allReady ? { deployFinishedAt: new Date().toISOString() } : {}),
    ...(anyFailed ? { error: agents.find((a) => a.status === "failed")?.error } : {}),
  };
}

// ── Deploy Report Storage ────────────────────────────────────────────────

function reportPath(planId: string): string {
  return path.join(ensureStateDir(), "reports", `${sanitizePlanId(planId)}.json`);
}

/**
 * Save a deploy report (produced by agent-team deploy-bridge).
 */
export async function saveReport(planId: string, report: unknown): Promise<void> {
  await atomicWriteJson(reportPath(planId), report);
}

/**
 * Load a deploy report by planId.
 */
export async function loadReport(planId: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(reportPath(planId), "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if (isFileNotFound(err)) return null;
    console.error(`[orchestrator] failed to load report "${planId}":`, err);
    return null;
  }
}

// ── Plan ID Generation ───────────────────────────────────────────────────

/**
 * Generate a unique plan id.
 * Format: orch-{date}-{random}  e.g. "orch-20260222-a3f7"
 */
export function generatePlanId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomUUID().slice(0, 8);
  return `orch-${date}-${rand}`;
}
