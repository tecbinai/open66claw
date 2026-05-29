/**
 * Skills Batch Download Controller
 * Phases: idle -> banner -> confirm -> downloading -> result | complete
 *
 * Convention: backend uses snake_case, this controller translates to camelCase.
 */

import type { GatewayBrowserClient } from "../gateway.js";

export type SkillsBatchPhase =
  | "idle"
  | "banner"
  | "confirm"
  | "downloading"
  | "result"
  | "complete";

export type SkillBatchItem = {
  name: string;
  icon: string;
  status: "queued" | "downloading" | "retrying" | "verifying" | "done" | "failed";
  progress?: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  detail?: string;
  mirror?: string;
  retryMirror?: string;
  error?: string;
};

export type BatchProgress = {
  completed: number;
  total: number;
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  activeMirror?: string;
  activeMirrorLatency?: number;
};

export type FailedSkillItem = {
  name: string;
  icon: string;
  error: string;
  mirrorsTried: { name: string; error: string }[];
};

export type BatchCheckResult = {
  missing: {
    name: string;
    icon: string;
    category: string;
    size_bytes: number;
    method: string;
    tier: "core" | "recommended" | "optional";
    description: string;
  }[];
  installed?: { name: string; icon: string; tier: string }[];
  total_size_bytes: number;
  estimated_seconds: number;
  disk_available_bytes: number;
  disk_ok: boolean;
};

export type SkillsBatchState = {
  batchPhase: SkillsBatchPhase;
  batchId: string | null;
  batchSkills: SkillBatchItem[];
  batchProgress: BatchProgress;
  batchResult: { succeeded: string[]; failed: FailedSkillItem[]; durationMs: number } | null;
  batchCheckResult: BatchCheckResult | null;
  reportSent: boolean;
  batchMinimized: boolean;
};

export function createDefaultBatchState(): SkillsBatchState {
  return {
    batchPhase: "idle",
    batchId: null,
    batchSkills: [],
    batchProgress: { completed: 0, total: 0, bytesDownloaded: 0, bytesTotal: 0, speedBps: 0 },
    batchResult: null,
    batchCheckResult: null,
    reportSent: false,
    batchMinimized: false,
  };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Formatters (exported for use by view components)
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  if (bps <= 0) return "0 B/s";
  return `${formatBytes(bps)}/s`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatEstimate(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes}m`;
}

// ---------------------------------------------------------------------------
// RPC calls — method names match backend exactly
// ---------------------------------------------------------------------------

// Session-level guard: prevent banner from re-appearing on WebSocket reconnects.
// Once the banner has been shown (or dismissed), don't re-trigger until full page reload.
let _bannerCheckedThisSession = false;

/** Reset the session guard (e.g. after user explicitly requests re-check). */
export function resetBannerCheck(): void {
  _bannerCheckedThisSession = false;
}

export async function checkBatchSkills(
  state: SkillsBatchState & { client: GatewayBrowserClient | null; connected?: boolean },
): Promise<void> {
  if (!state.client) return;
  // Guard: only show banner once per session; skip if already past idle phase
  if (_bannerCheckedThisSession) return;
  if (state.batchPhase !== "idle") return;
  _bannerCheckedThisSession = true;
  try {
    const res = (await state.client.request("skills.batch.check", {})) as
      | BatchCheckResult
      | undefined;
    if (res && res.missing && res.missing.length > 0) {
      state.batchCheckResult = res;
      state.batchPhase = "banner";
    } else {
      state.batchCheckResult = null;
      state.batchPhase = "idle";
    }
  } catch (err) {
    console.warn("[skills-batch] check failed:", getErrorMessage(err));
    state.batchPhase = "idle";
  }
}

export async function startBatchInstall(
  state: SkillsBatchState & { client: GatewayBrowserClient | null },
  skills?: string[],
): Promise<void> {
  if (!state.client) return;
  const skillNames = skills ?? state.batchCheckResult?.missing.map((s) => s.name) ?? [];
  if (skillNames.length === 0) return;
  state.batchPhase = "downloading";
  state.reportSent = false;
  state.batchResult = null;
  state.batchSkills = skillNames.map((name) => {
    const meta = state.batchCheckResult?.missing.find((m) => m.name === name);
    return { name, icon: meta?.icon ?? "", status: "queued" as const };
  });
  state.batchProgress = {
    completed: 0,
    total: skillNames.length,
    bytesDownloaded: 0,
    bytesTotal: state.batchCheckResult?.total_size_bytes ?? 0,
    speedBps: 0,
  };
  try {
    // Method name: "skills.batch.install" (matches backend handler)
    const res = (await state.client.request("skills.batch.install", { skills: skillNames })) as
      | { batch_id?: string }
      | undefined;
    if (res?.batch_id) state.batchId = res.batch_id;
  } catch (err) {
    console.error("[skills-batch] start failed:", getErrorMessage(err));
    state.batchResult = {
      succeeded: [],
      failed: skillNames.map((n) => ({
        name: n,
        icon: "",
        error: getErrorMessage(err),
        mirrorsTried: [],
      })),
      durationMs: 0,
    };
    state.batchPhase = "result";
  }
}

export async function cancelBatchInstall(
  state: SkillsBatchState & { client: GatewayBrowserClient | null },
): Promise<void> {
  if (!state.client || !state.batchId) return;
  try {
    // Param key: batch_id (snake_case, matches backend)
    await state.client.request("skills.batch.cancel", { batch_id: state.batchId });
  } catch (err) {
    console.warn("[skills-batch] cancel failed:", getErrorMessage(err));
  }
  state.batchPhase = "idle";
  state.batchId = null;
}

export async function reportBatchFailures(
  state: SkillsBatchState & { client: GatewayBrowserClient | null },
): Promise<void> {
  if (!state.client || !state.batchResult) return;
  try {
    // Method name: "skills.batch.report-failures" (matches backend handler)
    // Transform FailedSkillItem[] to backend format
    const failedPayload = state.batchResult.failed.map((f) => ({
      skill: f.name,
      error: f.error,
      mirrors_tried: f.mirrorsTried.map((m) => m.name),
    }));
    await state.client.request("skills.batch.report-failures", {
      failed: failedPayload,
    });
    state.reportSent = true;
  } catch (err) {
    console.warn("[skills-batch] report failed:", getErrorMessage(err));
  }
}

// ---------------------------------------------------------------------------
// Backend stage → frontend status mapping
// ---------------------------------------------------------------------------

function mapStageToStatus(stage: string): SkillBatchItem["status"] | undefined {
  const map: Record<string, SkillBatchItem["status"]> = {
    queued: "queued",
    downloading: "downloading",
    installing: "downloading", // treat "installing" as "downloading" in UI
    retrying: "retrying",
    verifying: "verifying",
    done: "done",
    failed: "failed",
  };
  return map[stage];
}

// ---------------------------------------------------------------------------
// WebSocket event handler — translates snake_case backend events to camelCase
//
// Called by app-gateway.ts with:
//   { _wsEvent: "progress"|"complete"|"error", ...payload }
// ---------------------------------------------------------------------------

export function handleBatchEvent(state: SkillsBatchState, event: Record<string, unknown>): void {
  const wsEvent = event._wsEvent as string | undefined;

  // Handle "skills.batch.progress" WebSocket events
  if (wsEvent === "progress") {
    const type = event.type as string;

    if (type === "skill.progress") {
      // Per-skill progress: translate snake_case fields
      const skillName = event.skill as string;
      const idx = state.batchSkills.findIndex((s) => s.name === skillName);
      if (idx >= 0) {
        const prev = state.batchSkills[idx];
        const updated = [...state.batchSkills];
        updated[idx] = {
          ...prev,
          status: mapStageToStatus(event.stage as string) ?? prev.status,
          progress: (event.percent as number) ?? prev.progress,
          bytesDownloaded: (event.bytes_downloaded as number) ?? prev.bytesDownloaded,
          bytesTotal: (event.bytes_total as number) ?? prev.bytesTotal,
          mirror: (event.mirror as string) ?? prev.mirror,
          retryMirror: (event.retry_mirror as string) ?? prev.retryMirror,
          error: (event.error as string) ?? undefined,
        };
        state.batchSkills = updated;
      }
    } else if (type === "batch.progress") {
      // Overall batch progress: translate snake_case fields
      state.batchProgress = {
        completed: (event.completed as number) ?? state.batchProgress.completed,
        total: (event.total as number) ?? state.batchProgress.total,
        bytesDownloaded: (event.bytes_downloaded as number) ?? state.batchProgress.bytesDownloaded,
        bytesTotal: (event.bytes_total as number) ?? state.batchProgress.bytesTotal,
        speedBps: (event.speed_bps as number) ?? state.batchProgress.speedBps,
        activeMirror: (event.active_mirror as string) ?? state.batchProgress.activeMirror,
        activeMirrorLatency:
          (event.active_mirror_latency_ms as number) ?? state.batchProgress.activeMirrorLatency,
      };
    }
    // Ignore type === "batch.complete" inside progress events
    // (handled by the dedicated "skills.batch.complete" event below)
    return;
  }

  // Handle "skills.batch.complete" WebSocket event
  if (wsEvent === "complete") {
    const succeeded = (event.succeeded as string[]) ?? [];
    const rawFailed =
      (event.failed as Array<{ skill: string; error: string; mirrors_tried: string[] }>) ?? [];
    const failed: FailedSkillItem[] = rawFailed.map((f) => ({
      name: f.skill,
      icon: state.batchSkills.find((s) => s.name === f.skill)?.icon ?? "",
      error: f.error,
      mirrorsTried: (f.mirrors_tried ?? []).map((m) => ({ name: m, error: "" })),
    }));
    const durationMs = (event.duration_ms as number) ?? 0;
    state.batchResult = { succeeded, failed, durationMs };
    state.batchPhase = failed.length === 0 ? "complete" : "result";
    state.batchId = null;
    return;
  }

  // Handle "skills.batch.error" WebSocket event
  if (wsEvent === "error") {
    const error = (event.error as string) ?? "Unknown error";
    const failed: FailedSkillItem[] = state.batchSkills
      .filter((s) => s.status !== "done")
      .map((s) => ({ name: s.name, icon: s.icon, error, mirrorsTried: [] }));
    state.batchResult = {
      succeeded: state.batchSkills.filter((s) => s.status === "done").map((s) => s.name),
      failed,
      durationMs: 0,
    };
    state.batchPhase = "result";
    state.batchId = null;
    return;
  }
}

export async function dismissBanner(
  state: SkillsBatchState & { client: GatewayBrowserClient | null },
): Promise<void> {
  state.batchPhase = "idle";
  // Persist dismissal on backend so banner doesn't reappear after page refresh
  if (state.client) {
    try {
      await state.client.request("skills.batch.report-failures", { dismiss_banner: true });
    } catch (err) {
      console.warn("[skills-batch] dismiss persist failed:", getErrorMessage(err));
    }
  }
}
