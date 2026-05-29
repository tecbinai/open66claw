/**
 * Voice Tier Controller — manages voice tier state for the UI.
 *
 * Fetches tier status from the gateway, handles install actions,
 * and listens for progress events.
 */

import type { GatewayBrowserClient, GatewayEventFrame } from "../gateway.js";

// ---------------------------------------------------------------------------
// Types (mirroring server-side voice/types.ts)
// ---------------------------------------------------------------------------

export type VoiceTierLevel = "gpu-full" | "gpu-asr" | "cpu-full" | "cpu-asr" | "disabled";
type VoiceModelBackend = "sherpa-onnx" | "python-sidecar" | "edge-tts" | "api";
type GpuSidecarStatus = "stopped" | "starting" | "running" | "error";

export type VoiceTierStatusResponse = {
  tier: {
    tier: VoiceTierLevel;
    asrModel: { id: string; displayName: string; downloadSizeMB: number } | null;
    ttsModel: { id: string; displayName: string; downloadSizeMB: number } | null;
    reason: string;
    hardware: {
      gpu: { vendor: string; name: string; vramTotalMB: number; vramFreeMB: number } | null;
      totalRamMB: number;
      freeRamMB: number;
      cpuModel: string;
      cpuCores: number;
    };
  };
  asrAvailable: boolean;
  asrBackend: VoiceModelBackend | null;
  ttsAvailable: boolean;
  ttsBackend: VoiceModelBackend | null;
  gpuSidecar: {
    status: GpuSidecarStatus;
    pid?: number;
    port: number;
    asrReady: boolean;
    ttsReady: boolean;
    error?: string;
  } | null;
  installState: string;
  prefs?: VoicePrefs;
  apiAsrAvailable?: boolean;
  apiTtsAvailable?: boolean;
};

export type VoicePrefs = {
  asrProvider?: string;
  asrModel?: string;
  ttsProvider?: string;
  ttsModel?: string;
  ttsVoice?: string;
};

export type VoiceApiProviderInfo = {
  id: string;
  label: string;
  defaultModel: string;
  defaultVoice?: string;
  configured: boolean;
};

export type VoiceInstallProgress = {
  stage: string;
  percent: number;
  message: string;
  detail?: string;
  mirrorUsed?: string;
  error?: string;
};

export type VoiceApiProvidersResponse = {
  asrProviders: VoiceApiProviderInfo[];
  ttsProviders: VoiceApiProviderInfo[];
};

export type VoiceTierUIState = {
  loading: boolean;
  status: VoiceTierStatusResponse | null;
  installProgress: VoiceInstallProgress | null;
  error: string | null;
  apiProviders: VoiceApiProvidersResponse | null;
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialVoiceTierState(): VoiceTierUIState {
  return {
    loading: false,
    status: null,
    installProgress: null,
    error: null,
    apiProviders: null,
  };
}

// ---------------------------------------------------------------------------
// RPC calls
// ---------------------------------------------------------------------------

/**
 * Fetch current voice tier status from the gateway.
 */
export async function fetchVoiceTierStatus(
  client: GatewayBrowserClient,
): Promise<VoiceTierStatusResponse> {
  return await client.request<VoiceTierStatusResponse>("voice.tier.status");
}

/**
 * Force re-detect hardware.
 */
export async function detectHardware(client: GatewayBrowserClient): Promise<void> {
  await client.request("voice.tier.detect");
}

/**
 * Start one-click install. Progress comes via voice.tier.progress events.
 */
export async function startInstall(client: GatewayBrowserClient): Promise<void> {
  await client.request("voice.tier.install");
}

/**
 * Start the GPU sidecar manually.
 */
export async function startSidecar(client: GatewayBrowserClient): Promise<void> {
  await client.request("voice.sidecar.start");
}

/**
 * Stop the GPU sidecar.
 */
export async function stopSidecar(client: GatewayBrowserClient): Promise<void> {
  await client.request("voice.sidecar.stop");
}

/**
 * Get voice API provider list (configured status).
 */
export async function fetchVoiceApiProviders(
  client: GatewayBrowserClient,
): Promise<VoiceApiProvidersResponse> {
  return await client.request<VoiceApiProvidersResponse>("voice.api.providers");
}

/**
 * Get voice preferences.
 */
export async function fetchVoicePrefs(client: GatewayBrowserClient): Promise<VoicePrefs> {
  return await client.request<VoicePrefs>("voice.prefs.get");
}

/**
 * Set voice preferences (partial update).
 */
export async function setVoicePrefs(
  client: GatewayBrowserClient,
  patch: Partial<VoicePrefs>,
): Promise<{ prefs: VoicePrefs; status: VoiceTierStatusResponse }> {
  return await client.request<{ prefs: VoicePrefs; status: VoiceTierStatusResponse }>(
    "voice.prefs.set",
    patch,
  );
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/**
 * Check if a gateway event is a voice tier progress event.
 */
export function isVoiceTierProgressEvent(evt: GatewayEventFrame): boolean {
  return evt.event === "voice.tier.progress";
}

/**
 * Parse a voice tier progress event payload.
 */
export function parseVoiceTierProgress(evt: GatewayEventFrame): VoiceInstallProgress | null {
  if (evt.event !== "voice.tier.progress") return null;
  return evt.payload as VoiceInstallProgress;
}
