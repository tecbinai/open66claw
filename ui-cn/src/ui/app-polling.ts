import type { ClawdbotApp } from "./app";
import { loadDebug } from "./controllers/debug";
import { loadLogs } from "./controllers/logs";
import { initMcpCapabilities, type McpLifecycleCallbacks } from "./controllers/mcp-lifecycle.js";
import { loadNodes } from "./controllers/nodes";

type PollingHost = {
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  mcpPollInterval: number | null;
  tab: string;
};

export function startNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval != null) return;
  host.nodesPollInterval = window.setInterval(() => {
    if (host.tab !== "nodes" && host.tab !== "network") return;
    void loadNodes(host as unknown as ClawdbotApp, { quiet: true });
  }, 5000);
}

export function stopNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval == null) return;
  clearInterval(host.nodesPollInterval);
  host.nodesPollInterval = null;
}

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) return;
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "logs") return;
    void loadLogs(host as unknown as ClawdbotApp, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) return;
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) return;
  // 10s interval: debug data (status/health) can take 3-21s per call; no need for 3s refresh
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "debug") return;
    void loadDebug(host as unknown as ClawdbotApp);
  }, 10_000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) return;
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}

const MCP_POLL_INTERVAL_MS = 30_000;

export function startMcpPolling(host: PollingHost) {
  if (host.mcpPollInterval != null) return;
  host.mcpPollInterval = window.setInterval(() => {
    if (host.tab !== "extensions") return; // Tab-gated: only poll when on extensions page
    const app = host as unknown as ClawdbotApp;
    const client = app.client;
    if (!client) return;
    const callbacks: McpLifecycleCallbacks = {
      onStateChange: (patch) => {
        if (patch.capabilities !== undefined) app.mcpCapabilities = patch.capabilities;
        if (patch.processes !== undefined) app.mcpProcesses = patch.processes;
        if (patch.updateNotice !== undefined) app.mcpUpdateNotice = patch.updateNotice;
      },
    };
    void initMcpCapabilities(client, callbacks);
  }, MCP_POLL_INTERVAL_MS);
}

export function stopMcpPolling(host: PollingHost) {
  if (host.mcpPollInterval == null) return;
  clearInterval(host.mcpPollInterval);
  host.mcpPollInterval = null;
}
