/**
 * OpenClawCN: Networking Center controller.
 *
 * Manages RPC calls for the 组网中心 page: network status, discovery,
 * probe, interfaces, and configuration.
 */

import type {
  NetworkCenterStatus,
  NetworkDiscoveredGateway,
  NetworkProbeResult,
  NetworkInterfaceInfo,
} from "../app-view-state.js";
import type { GatewayBrowserClient } from "../gateway.js";

export type NetworkingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  networkStatusLoading: boolean;
  networkStatus: NetworkCenterStatus | null;
  networkStatusError: string | null;
  networkDiscoveryLoading: boolean;
  networkDiscoveredGateways: NetworkDiscoveredGateway[];
  networkDiscoveryError: string | null;
  networkProbeLoading: boolean;
  networkProbeResult: NetworkProbeResult | null;
  networkInterfacesLoading: boolean;
  networkInterfaces: NetworkInterfaceInfo[];
  networkConfigureLoading: boolean;
  networkConfigureError: string | null;
};

/** Fetch aggregated network status from the gateway. */
export async function loadNetworkStatus(state: NetworkingState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (state.networkStatusLoading) return;
  state.networkStatusLoading = true;
  state.networkStatusError = null;
  try {
    const res = (await state.client.request("gateway.network.status", {})) as
      | NetworkCenterStatus
      | undefined;
    if (res) state.networkStatus = res;
  } catch (err) {
    state.networkStatusError = String(err);
  } finally {
    state.networkStatusLoading = false;
  }
}

/** Trigger mDNS / Tailnet discovery scan. */
export async function discoverGateways(state: NetworkingState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (state.networkDiscoveryLoading) return;
  state.networkDiscoveryLoading = true;
  state.networkDiscoveryError = null;
  try {
    const res = (await state.client.request("gateway.network.discover", {})) as {
      gateways?: NetworkDiscoveredGateway[];
      error?: string;
    };
    state.networkDiscoveredGateways = Array.isArray(res?.gateways) ? res.gateways : [];
    if (res?.error) state.networkDiscoveryError = res.error;
  } catch (err) {
    state.networkDiscoveryError = String(err);
  } finally {
    state.networkDiscoveryLoading = false;
  }
}

/** Probe a remote gateway for reachability. */
export async function probeGateway(state: NetworkingState, targetHost: string): Promise<void> {
  if (!state.client || !state.connected) return;
  state.networkProbeLoading = true;
  state.networkProbeResult = null;
  try {
    const res = (await state.client.request("gateway.network.probe", {
      targetHost,
    })) as NetworkProbeResult | undefined;
    state.networkProbeResult = res ?? {
      targetHost,
      reachable: false,
      latencyMs: -1,
      error: "empty response",
    };
  } catch (err) {
    state.networkProbeResult = {
      targetHost,
      reachable: false,
      latencyMs: -1,
      error: String(err),
    };
  } finally {
    state.networkProbeLoading = false;
  }
}

/** Load local network interface information. */
export async function loadNetworkInterfaces(state: NetworkingState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (state.networkInterfacesLoading) return;
  state.networkInterfacesLoading = true;
  try {
    const res = (await state.client.request("gateway.network.interfaces", {})) as {
      interfaces?: NetworkInterfaceInfo[];
    };
    state.networkInterfaces = Array.isArray(res?.interfaces) ? res.interfaces : [];
  } catch {
    // silent fail for interface listing
  } finally {
    state.networkInterfacesLoading = false;
  }
}

/** Configure the gateway network mode. Triggers a restart if bind changes. */
export async function configureNetworkMode(
  state: NetworkingState,
  params: {
    bind?: "loopback" | "lan" | "tailnet";
    authToken?: string;
    generateAuthToken?: boolean;
  },
): Promise<void> {
  if (!state.client || !state.connected) return;
  state.networkConfigureLoading = true;
  state.networkConfigureError = null;
  try {
    await state.client.request("gateway.network.configure", params);
    // Reload status after successful configure
    await loadNetworkStatus(state);
  } catch (err) {
    state.networkConfigureError = String(err);
  } finally {
    state.networkConfigureLoading = false;
  }
}
