/**
 * ImageGen Tier Controller -- manages imagegen tier state for the UI.
 *
 * Fetches tier status from the gateway, handles install actions,
 * and listens for progress events.
 * Pattern follows controllers/voice-tier.ts.
 */

import type { GatewayBrowserClient, GatewayEventFrame } from "../gateway.js";

// ---------------------------------------------------------------------------
// Types (mirroring server-side imagegen/types.ts)
// ---------------------------------------------------------------------------

export type ImageGenTierLevel = "gpu-hq" | "gpu-fast" | "cpu" | "api-only" | "disabled";
type ImageGenModelBackend = "sd-cpp" | "comfyui" | "a1111" | "api-only";
type SdCppSidecarStatus = "stopped" | "starting" | "running" | "error";

export type ImageGenTierStatusResponse = {
  tier: {
    tier: ImageGenTierLevel;
    model: { id: string; displayName: string; downloadSizeMB: number } | null;
    reason: string;
    hardware: {
      gpu: { vendor: string; name: string; vramTotalMB: number; vramFreeMB: number } | null;
      totalRamMB: number;
      freeRamMB: number;
      cpuModel: string;
      cpuCores: number;
    };
  };
  localAvailable: boolean;
  localBackend: ImageGenModelBackend | null;
  sidecar: {
    status: SdCppSidecarStatus;
    pid?: number;
    port: number;
    ready: boolean;
    error?: string;
    modelId?: string;
  } | null;
  installState: string;
  installedModels: string[];
};

export type ImageGenInstallProgress = {
  stage: string;
  percent: number;
  message: string;
  detail?: string;
  mirrorUsed?: string;
  error?: string;
};

export type ImageGenTierUIState = {
  loading: boolean;
  status: ImageGenTierStatusResponse | null;
  installProgress: ImageGenInstallProgress | null;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialImageGenTierState(): ImageGenTierUIState {
  return {
    loading: false,
    status: null,
    installProgress: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// RPC calls
// ---------------------------------------------------------------------------

/**
 * Fetch current imagegen tier status from the gateway.
 */
export async function fetchImageGenTierStatus(
  client: GatewayBrowserClient,
): Promise<ImageGenTierStatusResponse> {
  return await client.request<ImageGenTierStatusResponse>("imagegen.tier.status");
}

/**
 * Force re-detect hardware.
 */
export async function detectImageGenHardware(client: GatewayBrowserClient): Promise<void> {
  await client.request("imagegen.tier.detect");
}

/**
 * Start one-click install. Progress comes via imagegen.tier.progress events.
 */
export async function startImageGenInstall(client: GatewayBrowserClient): Promise<void> {
  await client.request("imagegen.tier.install");
}

/**
 * Start the sd.cpp sidecar manually.
 */
export async function startImageGenSidecar(client: GatewayBrowserClient): Promise<void> {
  await client.request("imagegen.sidecar.start");
}

/**
 * Stop the sd.cpp sidecar.
 */
export async function stopImageGenSidecar(client: GatewayBrowserClient): Promise<void> {
  await client.request("imagegen.sidecar.stop");
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/**
 * Check if a gateway event is an imagegen tier progress event.
 */
export function isImageGenTierProgressEvent(evt: GatewayEventFrame): boolean {
  return evt.event === "imagegen.tier.progress";
}

/**
 * Parse an imagegen tier progress event payload.
 */
export function parseImageGenTierProgress(evt: GatewayEventFrame): ImageGenInstallProgress | null {
  if (evt.event !== "imagegen.tier.progress") return null;
  return evt.payload as ImageGenInstallProgress;
}
