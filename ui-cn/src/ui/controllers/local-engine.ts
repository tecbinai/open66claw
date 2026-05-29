/**
 * Local Engine Controller — manages local model hub state for the UI.
 *
 * Fetches unified local engine status from the gateway (hardware + all local
 * model states), handles single-model install/uninstall, and listens for
 * progress events.
 *
 * Pattern follows controllers/voice-tier.ts / imagegen-tier.ts but aggregates
 * both voice and imagegen subsystems via the `local_engine.*` RPC namespace.
 */

import type { GatewayBrowserClient, GatewayEventFrame } from "../gateway.js";

// ---------------------------------------------------------------------------
// Types (mirroring server-side local-engine.ts exports)
// ---------------------------------------------------------------------------

export type LocalModelRunMode = "gpu" | "cpu" | "online";

export type LocalModelStatus =
  | "not_available"
  | "installable"
  | "installing"
  | "installed"
  | "running";

export interface LocalModelItem {
  id: string;
  displayName: string;
  runMode: LocalModelRunMode;
  recommended: boolean;
  description: string;
  downloadSizeMB: number;
  runtimeMemoryMB: number;
  status: LocalModelStatus;
  capability: string;
  unavailableReason?: string;
}

export interface LocalEngineHardware {
  gpu: {
    vendor: string;
    name: string;
    vramTotalMB: number;
    vramFreeMB: number;
  } | null;
  totalRamMB: number;
  freeRamMB: number;
  cpuModel: string;
  cpuCores: number;
  platform: string;
  arch: string;
}

export interface LocalEngineStatus {
  hardware: LocalEngineHardware;
  models: Record<string, LocalModelItem[]>;
  summary: {
    runningCount: number;
    installedCount: number;
    totalDiskUsageMB: number;
  };
  voiceTier: string;
  imagegenTier: string;
}

export interface LocalEngineInstallProgress {
  modelId: string;
  stage: string;
  percent: number;
  message: string;
  detail?: string;
  error?: string;
}

export interface LocalEngineUIState {
  loading: boolean;
  status: LocalEngineStatus | null;
  /** Per-model install progress keyed by modelId */
  installProgress: Record<string, LocalEngineInstallProgress>;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialLocalEngineState(): LocalEngineUIState {
  return {
    loading: false,
    status: null,
    installProgress: {},
    error: null,
  };
}

// ---------------------------------------------------------------------------
// RPC calls
// ---------------------------------------------------------------------------

/**
 * Fetch comprehensive local engine status (hardware + all model states).
 */
export async function fetchLocalEngineStatus(
  client: GatewayBrowserClient,
): Promise<LocalEngineStatus> {
  return await client.request<LocalEngineStatus>("local_engine.status");
}

/**
 * Force re-detect hardware.
 */
export async function redetectHardware(client: GatewayBrowserClient): Promise<unknown> {
  return await client.request("local_engine.redetect");
}

/**
 * Install a single model by ID. Progress arrives via local_engine.progress events.
 */
export async function installModel(
  client: GatewayBrowserClient,
  modelId: string,
): Promise<{ started: boolean; modelId: string }> {
  return await client.request<{ started: boolean; modelId: string }>("local_engine.install", {
    modelId,
  });
}

/**
 * Install all recommended models for the current hardware tier.
 */
export async function installRecommended(
  client: GatewayBrowserClient,
): Promise<{ started: boolean }> {
  return await client.request<{ started: boolean }>("local_engine.install_recommended");
}

/**
 * Uninstall a model by ID.
 */
export async function uninstallModel(
  client: GatewayBrowserClient,
  modelId: string,
): Promise<{ modelId: string }> {
  return await client.request<{ modelId: string }>("local_engine.uninstall", { modelId });
}

/**
 * Start a sidecar for a domain ("voice" | "imagegen").
 */
export async function startSidecar(
  client: GatewayBrowserClient,
  domain: "voice" | "imagegen",
): Promise<unknown> {
  return await client.request("local_engine.start", { domain });
}

/**
 * Stop a sidecar for a domain.
 */
export async function stopSidecar(
  client: GatewayBrowserClient,
  domain: "voice" | "imagegen",
): Promise<unknown> {
  return await client.request("local_engine.stop", { domain });
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/**
 * Check if a gateway event is a local engine progress event.
 */
export function isLocalEngineProgressEvent(evt: GatewayEventFrame): boolean {
  return evt.event === "local_engine.progress";
}

/**
 * Parse a local engine progress event payload.
 */
export function parseLocalEngineProgress(
  evt: GatewayEventFrame,
): LocalEngineInstallProgress | null {
  if (evt.event !== "local_engine.progress") return null;
  return evt.payload as LocalEngineInstallProgress;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Human-readable run mode label */
export function runModeLabel(mode: LocalModelRunMode): string {
  switch (mode) {
    case "gpu":
      return "GPU";
    case "cpu":
      return "CPU";
    case "online":
      return "在线";
  }
}

/** Status badge text */
export function statusLabel(status: LocalModelStatus): string {
  switch (status) {
    case "not_available":
      return "不可用";
    case "installable":
      return "可安装";
    case "installing":
      return "安装中";
    case "installed":
      return "已安装";
    case "running":
      return "运行中";
  }
}

/** Status badge CSS class suffix */
export function statusClass(status: LocalModelStatus): string {
  switch (status) {
    case "not_available":
      return "unavailable";
    case "installable":
      return "installable";
    case "installing":
      return "installing";
    case "installed":
      return "installed";
    case "running":
      return "running";
  }
}

/** Format megabytes to human-readable string */
export function fmtMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Short GPU summary for the device bar */
export function gpuSummary(hw: LocalEngineHardware): string {
  if (!hw.gpu) return "无独立 GPU";
  return `${hw.gpu.name} (${fmtMB(hw.gpu.vramTotalMB)})`;
}

/** Short RAM summary for the device bar */
export function ramSummary(hw: LocalEngineHardware): string {
  return `${fmtMB(hw.totalRamMB)} 内存`;
}

/** Get the capability group ID for grouping in the Tab panel */
export function getModelCapGroup(capability: string): string {
  // Map sub-capabilities to user-facing group IDs
  switch (capability) {
    case "audio":
    case "tts":
      return "voice";
    case "imageGen":
      return "image";
    default:
      return capability;
  }
}

/** Sub-capability display name */
export function subCapLabel(capability: string): string {
  switch (capability) {
    case "audio":
      return "语音识别 (ASR)";
    case "tts":
      return "语音合成 (TTS)";
    case "imageGen":
      return "图像生成";
    default:
      return capability;
  }
}
