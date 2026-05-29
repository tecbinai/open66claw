import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import type { ChannelAccountSnapshot } from "../types";
import type { ChannelKey, ChannelsProps } from "./channels.types";

export function formatDuration(ms?: number | null) {
  if (!ms && ms !== 0) return "n/a";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  return `${hr}h`;
}

export function channelEnabled(key: ChannelKey, props: ChannelsProps) {
  const snapshot = props.snapshot;
  const channels = snapshot?.channels as Record<string, unknown> | null;
  if (!snapshot || !channels) return false;
  const channelStatus = channels[key] as Record<string, unknown> | undefined;
  const configured = typeof channelStatus?.configured === "boolean" && channelStatus.configured;
  const running = typeof channelStatus?.running === "boolean" && channelStatus.running;
  const connected = typeof channelStatus?.connected === "boolean" && channelStatus.connected;
  const accounts = snapshot.channelAccounts?.[key] ?? [];
  const accountActive = accounts.some(
    (account) => account.configured || account.running || account.connected,
  );
  return configured || running || connected || accountActive;
}

export function getChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
): number {
  return channelAccounts?.[key]?.length ?? 0;
}

/**
 * 判断 lastError 是否属于「未配置/已禁用」等非真正错误的状态。
 * 这些状态应用灰色提示而非红色警告。
 */
const BENIGN_ERRORS = ["not configured", "disabled", "not linked", "logged out"];
export function isUnconfiguredError(lastError?: string | null): boolean {
  if (!lastError) return false;
  return BENIGN_ERRORS.includes(lastError.toLowerCase().trim());
}

/**
 * 根据 lastError 内容返回 callout CSS 类：
 * - 未配置/禁用 → "callout muted"
 * - 真正的错误 → "callout danger"
 */
export function errorCalloutClass(lastError?: string | null): string {
  return isUnconfiguredError(lastError) ? "callout muted" : "callout danger";
}

export function renderChannelAccountCount(
  key: ChannelKey,
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null,
) {
  const count = getChannelAccountCount(key, channelAccounts);
  if (count < 2) return nothing;
  return html`<div class="account-count">${t("channel.accounts")} (${count})</div>`;
}

/**
 * Encode a route target value for the <select> element.
 * Format: "agent:{id}" or "project:{id}"
 */
function encodeRouteValue(targetType: "agent" | "project", targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * Decode a route target value from the <select> element.
 * Returns null for empty/default selection.
 */
function decodeRouteValue(
  value: string,
): { targetType: "agent" | "project"; targetId: string } | null {
  if (!value) return null;
  const colonIdx = value.indexOf(":");
  if (colonIdx < 0) return null;
  const type = value.slice(0, colonIdx);
  const id = value.slice(colonIdx + 1);
  if ((type === "agent" || type === "project") && id) {
    return { targetType: type, targetId: id };
  }
  return null;
}

/**
 * Render the <option> groups for agents and projects inside a route <select>.
 */
function renderRouteOptions(params: {
  agents: ChannelsProps["routeAgents"];
  projects: ChannelsProps["routeProjects"];
  currentValue: string;
}) {
  const { agents, projects, currentValue } = params;
  const agentOptions =
    agents && agents.length > 0
      ? html`
        <optgroup label="${t("channels.route.agents")}">
          ${agents.map((a) => {
            const val = encodeRouteValue("agent", a.agentId);
            return html`<option value=${val} ?selected=${val === currentValue}>${a.name || a.agentId}</option>`;
          })}
        </optgroup>
      `
      : nothing;
  const projectOptions =
    projects && projects.length > 0
      ? html`
        <optgroup label="${t("channels.route.projects")}">
          ${projects.map((p) => {
            const val = encodeRouteValue("project", p.projectId);
            return html`<option value=${val} ?selected=${val === currentValue}>${p.name}</option>`;
          })}
        </optgroup>
      `
      : nothing;
  return html`${agentOptions}${projectOptions}`;
}

/**
 * Renders the channel-to-agent/project route binding selector.
 * Placed at the bottom of each channel card body.
 *
 * Shows agents and projects in separate optgroups.
 * When a channel has multiple accounts (e.g. 3 feishu bots), renders one
 * dropdown per account so each bot can be independently routed.
 * When there's 0 or 1 account, renders a single dropdown for the channel.
 */
export function renderChannelRouteSection(params: {
  channelId: string;
  props: ChannelsProps;
  accounts?: ChannelAccountSnapshot[];
}) {
  const { channelId, props, accounts } = params;
  const routes = props.routeSummary;
  const agents = props.routeAgents;
  const projects = props.routeProjects;

  // Don't render if route data hasn't loaded yet
  if (!routes) return nothing;

  const hasAgents = agents && agents.length > 0;
  const hasProjects = projects && projects.length > 0;

  // Don't render if no agents or projects exist (nothing to bind to)
  if (!hasAgents && !hasProjects) return nothing;

  const hasMultipleAccounts = accounts && accounts.length > 1;

  /** Get encoded current value from route entry */
  const getCurrentValue = (route: (typeof routes)[number] | undefined): string => {
    if (!route) return "";
    return encodeRouteValue(route.targetType as "agent" | "project", route.targetId);
  };

  /** Handle select change — decode value and dispatch */
  const makeChangeHandler = (accountId: string | undefined) => (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const decoded = decodeRouteValue(select.value);
    if (decoded) {
      props.onRouteChange(channelId, accountId, decoded.targetId, decoded.targetType);
    } else {
      // "none" selected — clear route; targetType doesn't matter for null targetId
      props.onRouteChange(channelId, accountId, null, "agent");
    }
  };

  if (hasMultipleAccounts) {
    return html`
      <div class="channel-route-section">
        <div class="channel-route-section__title">${t("channels.route")}</div>
        <div class="channel-route-section__desc">${t("channels.route.desc") ?? ""}</div>
        ${accounts.map((account) => {
          const accountId = account.accountId;
          const label = account.name || accountId;
          const currentRoute = routes.find(
            (r) => r.channel === channelId && r.accountId === accountId,
          );
          const currentValue = getCurrentValue(currentRoute);

          return html`
            <div class="channel-route-section__row">
              <label class="channel-route-section__label">${label}</label>
              <select
                class="channel-route-section__select"
                .value=${currentValue}
                ?disabled=${props.routeSaving}
                @change=${makeChangeHandler(accountId)}
              >
                <option value="">${t("channels.route.none")}</option>
                ${renderRouteOptions({ agents, projects, currentValue })}
              </select>
            </div>
          `;
        })}
        ${
          props.routeSavedHint
            ? html`
          <div class="ch-wizard__route-saved">${t("channels.route.saved")}</div>
        `
            : nothing
        }
      </div>
    `;
  }

  // Single account or no accounts: one dropdown for the whole channel.
  // If there's exactly one account, use its accountId so the binding is scoped
  // to that specific bot rather than matching all bots on the channel.
  const singleAccountId = accounts && accounts.length === 1 ? accounts[0]?.accountId : undefined;
  const currentRoute = routes.find(
    (r) =>
      r.channel === channelId &&
      (singleAccountId ? r.accountId === singleAccountId : !r.accountId),
  );
  const currentValue = getCurrentValue(currentRoute);

  return html`
    <div class="channel-route-section">
      <div class="channel-route-section__title">${t("channels.route")}</div>
      <div class="channel-route-section__desc">${t("channels.route.desc") ?? ""}</div>
      <div class="channel-route-section__row">
        <label class="channel-route-section__label">${t("channels.route.target")}</label>
        <select
          class="channel-route-section__select"
          .value=${currentValue}
          ?disabled=${props.routeSaving}
          @change=${makeChangeHandler(singleAccountId)}
        >
          <option value="">${t("channels.route.none")}</option>
          ${renderRouteOptions({ agents, projects, currentValue })}
        </select>
      </div>
      ${
        props.routeSavedHint
          ? html`
        <div class="ch-wizard__route-saved">${t("channels.route.saved")}</div>
      `
          : nothing
      }
    </div>
  `;
}
