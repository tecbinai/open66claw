/**
 * OpenClawCN: Network Center (组网中心) — main view.
 *
 * Standalone page replacing the old "instances" and "nodes" navigation items.
 * Three sub-tabs: My Devices / Connection / Security.
 *
 * Design doc: docs/requirements/network-center-uiue-blueprint.md
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  NetworkTab,
  NetworkCenterStatus,
  NetworkDiscoveredGateway,
  NetworkProbeResult,
  NetworkInterfaceInfo,
} from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { brand } from "../brand.js";
import { formatPresenceAge, formatPresenceSummary } from "../presenter.js";
import type { PresenceEntry } from "../types.js";
import type { NodesProps } from "./nodes.js";
import {
  renderDevices as renderDevicePairing,
  renderExecApprovals,
  renderBindings,
  resolveBindingsState,
  resolveExecApprovalsState,
} from "./nodes.js";

// ============================================================================
// Props
// ============================================================================

export type NetworkCenterProps = {
  // Sub-tab state
  activeTab: NetworkTab;
  onTabChange: (tab: NetworkTab) => void;

  // Status bar
  statusLoading: boolean;
  status: NetworkCenterStatus | null;
  statusError: string | null;
  onRefreshStatus: () => void;

  // Tab 1: My Devices — presence entries (online instances)
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  onRefreshPresence: () => void;

  // Tab 1: My Devices — node pairing + nodes list (from nodes controller)
  nodesProps: NodesProps;

  // Tab 2: Connection — discovery
  discoveryLoading: boolean;
  discoveredGateways: NetworkDiscoveredGateway[];
  discoveryError: string | null;
  onDiscover: () => void;

  // Tab 2: Connection — probe
  probeLoading: boolean;
  probeResult: NetworkProbeResult | null;
  onProbe: (host: string) => void;

  // Tab 2: Connection — interfaces
  interfacesLoading: boolean;
  interfaces: NetworkInterfaceInfo[];

  // Tab 2: Connection — configure
  configureLoading: boolean;
  configureError: string | null;
  onConfigure: (params: {
    bind?: "loopback" | "lan" | "tailnet";
    generateAuthToken?: boolean;
  }) => void;
};

// ============================================================================
// Main render
// ============================================================================

export function renderNetworkCenter(props: NetworkCenterProps): TemplateResult {
  return html`
    <div class="network-center">
      ${renderStatusBar(props)}
      ${renderSubTabBar(props)}
      ${props.activeTab === "devices" ? renderDevicesTab(props) : nothing}
      ${props.activeTab === "connection" ? renderConnectionTab(props) : nothing}
      ${props.activeTab === "security" ? renderSecurityTab(props) : nothing}
    </div>
  `;
}

// ============================================================================
// Status bar
// ============================================================================

function renderStatusBar(props: NetworkCenterProps): TemplateResult {
  const s = props.status;

  if (props.statusLoading && !s) {
    return html`<div class="callout" style="margin-bottom: 16px; animation: pulse 1.5s ease-in-out infinite;">
      ${t("network.statusBar.restarting")}
    </div>`;
  }

  if (!s) {
    return html`<div class="callout" style="margin-bottom: 16px;">
      ${props.statusError ?? t("network.statusBar.loopback")}
    </div>`;
  }

  const modeLabel =
    s.mode === "lan"
      ? s.localIp
        ? t("network.statusBar.lanWithIp").replace("{ip}", s.localIp)
        : t("network.statusBar.lan")
      : s.mode === "tailnet"
        ? t("network.statusBar.tailnet")
        : t("network.statusBar.loopback");

  const devicesLabel =
    s.onlineDeviceCount > 0
      ? t("network.statusBar.devicesOnline").replace("{count}", String(s.onlineDeviceCount))
      : t("network.statusBar.noDevices");

  const remoteLabel = s.tailscaleConnected
    ? t("network.statusBar.tailscaleServe")
    : t("network.statusBar.noRemote");

  return html`
    <div class="card" style="margin-bottom: 16px; padding: 12px 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <span
            class="chip"
            style="cursor: pointer;"
            @click=${() => props.onTabChange("connection")}
          >${modeLabel}</span>
          <span style="color: var(--muted-strong, #6b7d91);">&middot;</span>
          <span
            class="chip"
            style="cursor: pointer;"
            @click=${() => props.onTabChange("devices")}
          >${devicesLabel}</span>
          ${
            s.onlineNodeCount > 0
              ? html`
                <span style="color: var(--muted-strong, #6b7d91);">&middot;</span>
                <span class="chip">${t("network.statusBar.nodesOnline").replace("{count}", String(s.onlineNodeCount))}</span>
              `
              : nothing
          }
          <span style="color: var(--muted-strong, #6b7d91);">&middot;</span>
          <span class="chip" style="cursor: pointer;" @click=${() => props.onTabChange("connection")}>${remoteLabel}</span>
        </div>
        <button
          class="btn btn--sm"
          ?disabled=${props.statusLoading}
          @click=${props.onRefreshStatus}
        >${props.statusLoading ? "..." : t("common.refresh")}</button>
      </div>
    </div>
  `;
}

// ============================================================================
// Sub-tab bar
// ============================================================================

function renderSubTabBar(props: NetworkCenterProps): TemplateResult {
  const tabs: Array<{ id: NetworkTab; label: string }> = [
    { id: "devices", label: t("network.tab.devices") },
    { id: "connection", label: t("network.tab.connection") },
    { id: "security", label: t("network.tab.security") },
  ];

  return html`
    <div style="display: flex; gap: 0; margin-bottom: 24px; border-bottom: 1px solid var(--border);">
      ${tabs.map(
        (tab) => html`
          <button
            @click=${() => props.onTabChange(tab.id)}
            style="
              all: unset;
              cursor: pointer;
              padding: 10px 24px;
              font-size: 14px;
              font-weight: ${tab.id === props.activeTab ? "700" : "400"};
              color: ${tab.id === props.activeTab ? "var(--fg)" : "var(--muted-strong, #6b7d91)"};
              border-bottom: 2px solid ${tab.id === props.activeTab ? "var(--accent, #6c8cff)" : "transparent"};
              transition: color 150ms, border-color 150ms;
              user-select: none;
            "
          >${tab.label}</button>
        `,
      )}
    </div>
  `;
}

// ============================================================================
// Tab 1: My Devices (我的设备)
// ============================================================================

function renderDevicesTab(props: NetworkCenterProps): TemplateResult {
  const entries = props.presenceEntries;
  const hasDevices = entries.length > 0 || (props.nodesProps.nodes?.length ?? 0) > 0;

  return html`
    <!-- Online devices (presence entries) -->
    <section class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("network.devices.title")}</div>
          <div class="card-sub">${t("network.devices.desc")}</div>
        </div>
        <button class="btn" ?disabled=${props.presenceLoading} @click=${props.onRefreshPresence}>
          ${props.presenceLoading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>
      ${
        props.presenceError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.presenceError}</div>`
          : nothing
      }
      <div class="list" style="margin-top: 16px;">
        ${
          entries.length === 0 && !props.presenceLoading
            ? html`<div class="muted">${t("network.devices.noDevices")}</div>`
            : entries.map((entry) => renderPresenceEntry(entry))
        }
      </div>
    </section>

    <!-- Node list from nodes controller -->
    ${
      (props.nodesProps.nodes?.length ?? 0) > 0
        ? html`
          <section class="card" style="margin-bottom: 16px;">
            <div class="row" style="justify-content: space-between;">
              <div>
                <div class="card-title">${t("network.statusBar.nodesOnline").replace("{count}", String(props.nodesProps.nodes.length))}</div>
              </div>
              <button class="btn" ?disabled=${props.nodesProps.loading} @click=${props.nodesProps.onRefresh}>
                ${props.nodesProps.loading ? t("common.loading") : t("common.refresh")}
              </button>
            </div>
            <div class="list" style="margin-top: 16px;">
              ${props.nodesProps.nodes.map((n) => renderNodeEntry(n))}
            </div>
          </section>
        `
        : nothing
    }

    <!-- Device pairing (reused from nodes.ts) -->
    ${renderDevicePairing(props.nodesProps)}

    <!-- Empty state guidance -->
    ${!hasDevices && !props.presenceLoading ? renderEmptyState(props) : nothing}

    <!-- How to add devices tutorial (collapsible) -->
    ${hasDevices ? renderTutorial() : nothing}

    <!-- Windows mDNS hint -->
    ${
      props.status?.platform === "win32"
        ? html`
          <div class="callout" style="margin-top: 16px; font-size: 0.9em;">
            ${t("network.devices.windowsHint")}
          </div>
        `
        : nothing
    }
  `;
}

function renderPresenceEntry(entry: PresenceEntry): TemplateResult {
  const isOnline = true; // Presence entries are always online
  const mode = entry.mode ?? "";
  const roles = Array.isArray((entry as Record<string, unknown>).roles)
    ? ((entry as Record<string, unknown>).roles as string[]).filter(Boolean)
    : [];
  const displayName = entry.host ?? t("network.devices.gateway");
  const isGateway = roles.includes("gateway") || mode === "gateway";
  const isWebchat = mode === "webchat" || roles.includes("webchat");

  const typeLabel = isGateway
    ? t("network.devices.gateway")
    : isWebchat
      ? t("network.devices.webchat")
      : t("network.devices.node");

  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title" style="display: flex; align-items: center; gap: 8px;">
          <span style="
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${isOnline ? "var(--success, #22c55e)" : "var(--muted, #888)"};
          "></span>
          ${displayName}
        </div>
        <div class="list-sub">${formatPresenceSummary(entry)}</div>
        <div class="chip-row">
          <span class="chip">${typeLabel}</span>
          ${entry.platform ? html`<span class="chip">${entry.platform}</span>` : nothing}
          ${entry.version ? html`<span class="chip">${entry.version}</span>` : nothing}
        </div>
      </div>
      <div class="list-meta" style="text-align: right; font-size: 0.85em; color: var(--muted-strong, #6b7d91);">
        <div>${formatPresenceAge(entry)}</div>
      </div>
    </div>
  `;
}

function renderNodeEntry(node: Record<string, unknown>): TemplateResult {
  const nodeId = String((node.nodeId ?? node.id ?? "") as string);
  const displayName = String((node.displayName ?? node.name ?? nodeId) as string);
  const ip = String((node.remoteIp ?? node.ip ?? "") as string);
  const platform = String((node.platform ?? "") as string);
  const version = String((node.version ?? "") as string);
  const caps = Array.isArray(node.capabilities) ? (node.capabilities as string[]) : [];

  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title" style="display: flex; align-items: center; gap: 8px;">
          <span style="
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success, #22c55e);
          "></span>
          ${displayName}
        </div>
        <div class="list-sub">${ip}</div>
        <div class="chip-row">
          <span class="chip">${t("network.devices.node")}</span>
          ${platform ? html`<span class="chip">${platform}</span>` : nothing}
          ${version ? html`<span class="chip">${version}</span>` : nothing}
          ${caps.map((cap) => html`<span class="chip">${cap}</span>`)}
        </div>
      </div>
      <div class="list-meta" style="text-align: right;">
        <span class="chip chip-ok">${t("network.devices.online")}</span>
      </div>
    </div>
  `;
}

function renderEmptyState(props: NetworkCenterProps): TemplateResult {
  return html`
    <section class="card" style="margin-top: 16px; text-align: center; padding: 32px 24px;">
      <div class="card-title" style="margin-bottom: 8px;">${t("network.devices.emptyState.title")}</div>
      <div class="card-sub" style="margin-bottom: 20px;">${t("network.devices.emptyState.desc")}</div>
      <div style="text-align: left; max-width: 400px; margin: 0 auto; line-height: 2;">
        <div>1. ${t("network.devices.emptyState.step1")}
          <button class="btn btn--sm" style="margin-left: 8px;" @click=${() => props.onTabChange("connection")}>
            ${t("network.devices.emptyState.goToConnection")}
          </button>
        </div>
        <div>2. ${t("network.devices.emptyState.step2", { appName: brand.productName })}</div>
        <div>3. ${t("network.devices.emptyState.step3")}</div>
      </div>
      <div style="margin-top: 20px; color: var(--muted-strong, #6b7d91);">
        ${t("network.devices.emptyState.remoteHint")}
        <button class="btn btn--sm" style="margin-left: 8px;" @click=${() => props.onTabChange("connection")}>
          ${t("network.devices.emptyState.goToRemote")}
        </button>
      </div>
    </section>
  `;
}

function renderTutorial(): TemplateResult {
  return html`
    <section class="card" style="margin-top: 16px;">
      <details>
        <summary style="cursor: pointer; font-weight: 600; padding: 8px 0;">
          ${t("network.devices.tutorial.title")}
        </summary>
        <div style="padding: 12px 0; line-height: 2; font-size: 0.9em;">
          <div style="font-weight: 600; margin-bottom: 4px;">${t("network.devices.tutorial.mobile")}</div>
          <div style="padding-left: 16px;">
            <div>1. ${t("network.devices.tutorial.mobileStep1", { appName: brand.productName, appShortName: brand.productShortName })}</div>
            <div>2. ${t("network.devices.tutorial.mobileStep2")}</div>
            <div>3. ${t("network.devices.tutorial.mobileStep3")}</div>
          </div>
          <div style="font-weight: 600; margin: 12px 0 4px;">${t("network.devices.tutorial.desktop")}</div>
          <div style="padding-left: 16px;">
            <div>1. ${t("network.devices.tutorial.desktopStep1", { appName: brand.productName })}</div>
            <div>2. ${t("network.devices.tutorial.desktopStep2")}</div>
            <div>3. ${t("network.devices.tutorial.desktopStep3")}</div>
          </div>
        </div>
      </details>
    </section>
  `;
}

// ============================================================================
// Tab 2: Connection (连接方式)
// ============================================================================

function renderConnectionTab(props: NetworkCenterProps): TemplateResult {
  return html`
    ${renderNetworkModeSelector(props)}
    ${renderDiscoverySection(props)}
    ${renderInterfacesSection(props)}
    ${renderTunnelPlaceholder()}
    ${renderRedisPlaceholder()}
  `;
}

function renderNetworkModeSelector(props: NetworkCenterProps): TemplateResult {
  const currentMode = props.status?.mode ?? "loopback";
  const modes: Array<{ id: "loopback" | "lan" | "tailnet"; labelKey: string; descKey: string }> = [
    {
      id: "loopback",
      labelKey: "network.connection.mode.loopback",
      descKey: "network.connection.mode.loopbackDesc",
    },
    {
      id: "lan",
      labelKey: "network.connection.mode.lan",
      descKey: "network.connection.mode.lanDesc",
    },
    {
      id: "tailnet",
      labelKey: "network.connection.mode.tailnet",
      descKey: "network.connection.mode.tailnetDesc",
    },
  ];

  return html`
    <section class="card" style="margin-bottom: 16px;">
      <div class="card-title">${t("network.connection.modeTitle")}</div>
      <div class="card-sub" style="margin-bottom: 16px;">${t("network.connection.modeDesc")}</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${modes.map(
          (m) => html`
            <div
              style="
                cursor: pointer;
                border: 2px solid ${m.id === currentMode ? "var(--accent, #6c8cff)" : "var(--border)"};
                border-radius: 8px;
                padding: 14px 16px;
                transition: border-color 150ms;
              "
              @click=${() => {
                if (m.id !== currentMode) {
                  if (m.id === "loopback") {
                    props.onConfigure({ bind: "loopback" });
                  } else {
                    // Non-loopback modes need auth token; auto-generate if none
                    props.onConfigure({
                      bind: m.id,
                      generateAuthToken: !props.status?.hasAuthToken,
                    });
                  }
                }
              }}
            >
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <div style="font-weight: ${m.id === currentMode ? "700" : "400"};">${t(m.labelKey as never)}</div>
                  <div style="font-size: 0.88em; color: var(--muted-strong, #6b7d91); margin-top: 4px;">
                    ${t(m.descKey as never)}
                  </div>
                </div>
                ${
                  m.id === currentMode
                    ? html`<span class="chip" style="background: var(--accent, #6c8cff); color: white;">${t("network.connection.current")}</span>`
                    : nothing
                }
              </div>
            </div>
          `,
        )}
      </div>
      ${
        props.configureLoading
          ? html`<div class="callout" style="margin-top: 12px;">${t("network.connection.applying")}</div>`
          : nothing
      }
      ${
        props.configureError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.configureError}</div>`
          : nothing
      }
      ${
        currentMode !== "loopback"
          ? html`<div class="callout" style="margin-top: 12px; font-size: 0.88em;">
            ${t("network.connection.restartNote")}
          </div>`
          : nothing
      }
      <!-- Current address info -->
      ${
        props.status
          ? html`
            <div style="margin-top: 16px; font-size: 0.9em; color: var(--muted-strong, #6b7d91);">
              <div>${t("network.connection.currentAddress")}: ${props.status.gatewayBind}:${props.status.gatewayPort}</div>
              ${
                props.status.localIp
                  ? html`<div>${t("network.connection.lanIp")}: ${props.status.localIp}</div>`
                  : nothing
              }
              ${
                props.status.tailnetIp
                  ? html`<div>Tailscale IP\uff1a${props.status.tailnetIp}</div>`
                  : nothing
              }
            </div>
          `
          : nothing
      }
    </section>
  `;
}

function renderDiscoverySection(props: NetworkCenterProps): TemplateResult {
  return html`
    <section class="card" style="margin-bottom: 16px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("network.connection.discovery.title")}</div>
          <div class="card-sub">${t("network.connection.discovery.desc", { appName: brand.productName })}</div>
        </div>
        <button class="btn" ?disabled=${props.discoveryLoading} @click=${props.onDiscover}>
          ${props.discoveryLoading ? t("network.connection.discovery.scanning") : t("network.connection.discovery.scan")}
        </button>
      </div>
      ${
        props.discoveryError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.discoveryError}</div>`
          : nothing
      }
      <div class="list" style="margin-top: 16px;">
        ${
          props.discoveredGateways.length === 0 && !props.discoveryLoading
            ? html`<div class="muted">${t("network.connection.discovery.noGateways")}</div>`
            : props.discoveredGateways.map((gw) => renderDiscoveredGateway(gw, props))
        }
      </div>
    </section>
  `;
}

function renderDiscoveredGateway(
  gw: NetworkDiscoveredGateway,
  props: NetworkCenterProps,
): TemplateResult {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title" style="display: flex; align-items: center; gap: 8px;">
          <span style="
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--info, #3b82f6);
          "></span>
          ${gw.displayName || gw.instanceName}
        </div>
        <div class="list-sub">${gw.host}:${gw.port}</div>
        <div class="chip-row">
          ${gw.platform ? html`<span class="chip">${gw.platform}</span>` : nothing}
          ${gw.version ? html`<span class="chip">${gw.version}</span>` : nothing}
          ${gw.role ? html`<span class="chip">${gw.role}</span>` : nothing}
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button
          class="btn btn--sm"
          ?disabled=${props.probeLoading}
          @click=${() => props.onProbe(`${gw.host}:${gw.port}`)}
        >${props.probeLoading ? t("network.connection.discovery.probing") : t("network.connection.discovery.probe")}</button>
      </div>
    </div>
    ${
      props.probeResult && props.probeResult.targetHost === `${gw.host}:${gw.port}`
        ? html`
          <div class="callout ${props.probeResult.reachable ? "" : "danger"}" style="margin: 4px 0 8px 28px; font-size: 0.88em;">
            ${
              props.probeResult.reachable
                ? t("network.connection.discovery.reachable").replace(
                    "{ms}",
                    String(props.probeResult.latencyMs),
                  )
                : t("network.connection.discovery.unreachable").replace(
                    "{error}",
                    props.probeResult.error ?? "",
                  )
            }
          </div>
        `
        : nothing
    }
  `;
}

function renderInterfacesSection(props: NetworkCenterProps): TemplateResult {
  const ipv4 = props.interfaces.filter((i) => i.family === "IPv4" && !i.internal);
  if (ipv4.length === 0) {
    return html`${nothing}`;
  }

  return html`
    <section class="card" style="margin-bottom: 16px;">
      <div class="card-title">${t("network.connection.interfaces.title")}</div>
      <table style="width: 100%; margin-top: 12px; font-size: 0.9em; border-collapse: collapse;">
        <thead>
          <tr style="text-align: left; border-bottom: 1px solid var(--border);">
            <th style="padding: 6px 8px;">${t("network.connection.interfaces.name")}</th>
            <th style="padding: 6px 8px;">${t("network.connection.interfaces.address")}</th>
            <th style="padding: 6px 8px;">${t("network.connection.interfaces.tailnet")}</th>
          </tr>
        </thead>
        <tbody>
          ${ipv4.map(
            (iface) => html`
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 6px 8px;">${iface.name}</td>
                <td style="padding: 6px 8px; font-family: monospace;">${iface.address}</td>
                <td style="padding: 6px 8px;">${iface.isTailnet ? "Yes" : ""}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </section>
  `;
}

function renderTunnelPlaceholder(): TemplateResult {
  return html`
    <section class="card" style="margin-bottom: 16px; opacity: 0.7;">
      <div class="card-title">${t("network.connection.tunnel.title")}</div>
      <div class="card-sub">${t("network.connection.tunnel.desc")}</div>
      <div class="callout" style="margin-top: 12px;">${t("network.connection.tunnel.comingSoon")}</div>
    </section>
  `;
}

function renderRedisPlaceholder(): TemplateResult {
  return html`
    <details style="margin-bottom: 16px;">
      <summary class="card" style="cursor: pointer; list-style: none; padding: 14px 16px;">
        <span style="font-weight: 600;">${t("network.connection.redis.title")}</span>
        <span style="color: var(--muted-strong, #6b7d91); margin-left: 8px; font-size: 0.88em;">
          ${t("network.connection.redis.desc")}
        </span>
      </summary>
      <div class="card" style="margin-top: -1px; border-top: none; padding: 12px 16px;">
        <div class="callout">${t("network.connection.redis.comingSoon")}</div>
      </div>
    </details>
  `;
}

// ============================================================================
// Tab 3: Security (安全设置)
// ============================================================================

function renderSecurityTab(props: NetworkCenterProps): TemplateResult {
  return html`
    <!-- Guidance banner for single-device users -->
    <div class="callout" style="margin-bottom: 16px; font-size: 0.9em;">
      ${t("network.security.guidance")}
    </div>

    <!-- Command permissions (reused from nodes.ts) -->
    ${renderExecApprovals(resolveExecApprovalsState(props.nodesProps))}

    <!-- Execution location / bindings (reused from nodes.ts) -->
    ${renderBindings(resolveBindingsState(props.nodesProps))}
  `;
}
