/**
 * mcp-marketplace-card.ts
 * Store card component for the MCP Capability Store tab.
 *
 * Shows: icon + friendly name + version + security score + description
 *        + tags + badges + install button (state machine)
 */

import { html, nothing, type TemplateResult } from "lit";
import type { McpMarketplaceItem } from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import { CATEGORY_ICON } from "./mcp-shared.js";

export type MarketplaceCardProps = {
  item: McpMarketplaceItem;
  onClick: () => void;
  onInstall: () => void;
  onConfigInstall: () => void;
};

/* ── Platform compatibility check (Fix #11) ───────────── */

function detectCurrentPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

function isPlatformCompatible(item: McpMarketplaceItem): boolean {
  if (!item.platforms || item.platforms.length === 0) return true;
  return item.platforms.includes(detectCurrentPlatform());
}

/* ── Install button state machine ──────────────────────── */

function renderInstallButton(
  item: McpMarketplaceItem,
  onInstall: () => void,
  onConfigInstall: () => void,
): TemplateResult {
  // Fix #11: Platform check — show disabled label if incompatible
  if (!isPlatformCompatible(item)) {
    const label = item.platforms
      .map((p) => (p === "macos" ? "macOS" : p === "windows" ? "Windows" : "Linux"))
      .join(" / ");
    return html`
      <span class="ext-badge ext-badge--platform">${label}</span>
    `;
  }

  switch (item.installStatus) {
    case "installed":
      return html`
        <span class="ext-badge ext-badge--installed"><span class="mcp-icon" style="font-size:11px;">${icons.check}</span> ${t("extensions.store.installed")}</span>
      `;
    case "installing":
      return html`
        <span class="ext-badge ext-badge--installing">
          <span class="ext-spinner ext-spinner--sm"></span>
          ${t("extensions.store.installing")}
        </span>
      `;
    case "error": {
      const errMsg = item.errorMessage || "";
      // Show a short snippet below the button (max 60 chars)
      const shortErr = errMsg.length > 60 ? errMsg.slice(0, 57) + "..." : errMsg;
      // Detect missing runtime — guide user to chat for auto-install
      const lowerErr = errMsg.toLowerCase();
      const needsUv =
        lowerErr.includes("uvx") ||
        lowerErr.includes("python uv") ||
        lowerErr.includes("安装 uv");
      const needsNode =
        lowerErr.includes("node.js") ||
        lowerErr.includes("安装 node");
      const chatHint = needsUv
        ? "去聊天框输入「帮我安装 uv」即可自动安装"
        : needsNode
          ? "去聊天框输入「帮我安装 Node.js」即可自动安装"
          : "";
      return html`
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
          <button
            @click=${(e: Event) => {
              e.stopPropagation();
              // Route to config wizard if item has env vars to configure;
              // otherwise just retry the install directly.
              const hasConfigurableEnv =
                item.requiresApiKey ||
                (item.envRequired && item.envRequired.length > 0) ||
                (item.envSchema && Object.keys(item.envSchema).length > 0);
              if (hasConfigurableEnv) {
                onConfigInstall();
              } else {
                onInstall();
              }
            }}
            title=${errMsg}
            class="ext-badge ext-badge--error"
          >${t("extensions.store.installFailed")}</button>
          ${
            shortErr
              ? html`<span style="
            font-size:10px; color:var(--danger, #f87171); opacity:0.8;
            max-width:200px; word-break:break-all;
            line-height:1.3;
          ">${shortErr}</span>`
              : nothing
          }
          ${
            chatHint
              ? html`<span style="
            font-size:10px; color:var(--info, #60a5fa); opacity:0.9;
            max-width:200px; word-break:break-all;
            line-height:1.3; cursor:default;
          ">${chatHint}</span>`
              : nothing
          }
        </div>
      `;
    }
    default: // not_installed
      // Items without any install method → show "Manual Config" button + optional "View Source" link
      if (item.installable === false) {
        const url = item.sourceUrl || "";
        return html`
          <div style="display:flex; gap:6px; align-items:center;">
            <button
              @click=${(e: Event) => {
                e.stopPropagation();
                onConfigInstall();
              }}
              class="ext-pill-btn ext-pill-btn--warning ext-pill-btn--sm"
            >${t("extensions.store.manualConfig" as never)}</button>
            ${
              url
                ? html`
              <a
                href=${url}
                target="_blank"
                rel="noopener"
                @click=${(e: Event) => {
                  e.stopPropagation();
                }}
                style="
                  all:unset; cursor:pointer;
                  font-size:10px;
                  color:var(--muted-strong, #6b7d91);
                  text-decoration:underline;
                "
              >${t("extensions.store.viewSource" as never)}</a>
            `
                : nothing
            }
          </div>
        `;
      }
      if (
        item.requiresApiKey ||
        (item.envRequired && item.envRequired.length > 0) ||
        (item.envSchema && Object.keys(item.envSchema).length > 0)
      ) {
        return html`
          <button
            @click=${(e: Event) => {
              e.stopPropagation();
              onConfigInstall();
            }}
            class="ext-pill-btn ext-pill-btn--warning ext-pill-btn--sm"
          >${t("extensions.store.configAndInstall")}</button>
        `;
      }
      return html`
        <button
          @click=${(e: Event) => {
            e.stopPropagation();
            onInstall();
          }}
          class="ext-pill-btn ext-pill-btn--primary ext-pill-btn--sm"
        >${t("extensions.store.install")}</button>
      `;
  }
}

/* ── Badge pills ───────────────────────────────────────── */

/* ── Install method badge ──────────────────────────────── */

function renderInstallMethodBadge(item: McpMarketplaceItem): TemplateResult {
  const method = item.installMethod ?? "none";

  switch (method) {
    case "npm":
      return html`<span class="ext-badge ext-badge--npm"
        title="${t("extensions.store.installMethodNpmTip" as never)}"
        >${t("extensions.store.installMethodNpm" as never)}</span>`;
    case "pypi":
      return html`<span class="ext-badge ext-badge--pypi"
        title="${t("extensions.store.installMethodPypiTip" as never)}"
        >${t("extensions.store.installMethodPypi" as never)}</span>`;
    case "sse":
      return html`<span class="ext-badge ext-badge--sse"
        title="${t("extensions.store.installMethodSseTip" as never)}"
        >${t("extensions.store.installMethodSse" as never)}</span>`;
    default:
      return html`<span class="ext-badge ext-badge--none"
        >${t("extensions.store.installMethodNone" as never)}</span>`;
  }
}

function renderBadges(item: McpMarketplaceItem): TemplateResult {
  const badges: TemplateResult[] = [];

  // Install method badge — always first so users immediately see how it works
  badges.push(renderInstallMethodBadge(item));

  if (item.isOfficial) {
    badges.push(
      html`<span class="ext-badge ext-badge--official">${t("extensions.store.official")}</span>`,
    );
  }
  const needsConfig =
    item.requiresApiKey ||
    (item.envRequired && item.envRequired.length > 0) ||
    (item.envSchema && Object.keys(item.envSchema).length > 0);
  if (!needsConfig && item.installable !== false && item.installMethod !== "none") {
    badges.push(
      html`<span class="ext-badge ext-badge--zero-config">${t("extensions.store.zeroConfig")}</span>`,
    );
  } else if (needsConfig) {
    badges.push(
      html`<span class="ext-badge ext-badge--needs-key">${t("extensions.store.needsKey")}</span>`,
    );
  }
  // SSE risk badge — warn users this connects to a third-party server
  if (item.installMethod === "sse") {
    const isVerified = (item as McpMarketplaceItem & { isVerified?: boolean }).isVerified;
    if (!isVerified) {
      badges.push(html`<span class="ext-badge ext-badge--high-risk"
        title="${t("extensions.store.highRiskTip" as never)}"
        >${t("extensions.store.highRisk" as never)}</span>`);
    } else {
      badges.push(html`<span class="ext-badge ext-badge--remote"
        title="${t("extensions.store.remoteServiceTip" as never)}"
        >${t("extensions.store.remoteService" as never)}</span>`);
    }
  }
  if (item.isNew) {
    badges.push(
      html`<span class="ext-badge ext-badge--new">${t("extensions.store.newBadge")}</span>`,
    );
  }
  if (item.hasUpdate) {
    badges.push(
      html`<span class="ext-badge ext-badge--update">${t("extensions.store.hasUpdate" as never)}</span>`,
    );
  }

  return html`<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">${badges}</div>`;
}

/* ── Security score shield ─────────────────────────────── */

function renderSecurityScore(score: number): TemplateResult {
  if (score < 60) return html`${nothing}`;
  const color = score >= 80 ? "var(--ok, #34d399)" : "var(--warn, #fbbf24)";
  return html`
    <span style="
      font-size:10px;
      display:inline-flex;
      align-items:center;
      gap:3px;
      color:${color};
      opacity:0.9;
    "><span class="mcp-icon" style="font-size:11px;">${icons.shieldCheck}</span> ${score}</span>
  `;
}

/* ── Main card ─────────────────────────────────────────── */

export function renderMarketplaceCard(props: MarketplaceCardProps): TemplateResult {
  const { item, onClick, onInstall, onConfigInstall } = props;
  const iconName = CATEGORY_ICON[item.category] ?? "puzzle";
  const isInstalled = item.installStatus === "installed";
  const notInstallable = item.installable === false || item.installMethod === "none";

  return html`
    <div
      @click=${onClick}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="article"
      tabindex="0"
      aria-label="${item.friendlyName} — ${item.description}"
      class="ext-market-card ${notInstallable ? "ext-market-card--dimmed" : ""}"
    >
      <!-- Top row: icon + name + version + security -->
      <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:10px;">
        <!-- Category icon -->
        <div class="ext-market-card__icon ${isInstalled ? "ext-market-card__icon--installed" : "ext-market-card__icon--default"}"><span class="mcp-icon" style="font-size:18px;">${icons[iconName]}</span></div>

        <!-- Name + package -->
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="ext-market-card__name">${item.friendlyName}</span>
            <span class="ext-badge ext-badge--version">v${item.version}</span>
            ${
              item.installedVersion && item.installedVersion !== item.version
                ? html`<span class="ext-badge ext-badge--version-upgrade">v${item.installedVersion} \u2192 v${item.version}</span>`
                : nothing
            }
            ${renderSecurityScore(item.securityScore)}
          </div>
          <div style="font-size:10px; color:var(--muted-strong, #6b7d91); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${item.npmPackage || item.serverId}
          </div>
        </div>
      </div>

      <!-- Description (2-line clamp) -->
      <div class="ext-market-card__desc">${item.description}</div>

      <!-- Tags -->
      ${
        item.tags.length > 0
          ? html`
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
              ${item.tags
                .slice(0, 3)
                .map((tag) => html`<span class="ext-market-card__tag">${tag}</span>`)}
            </div>
          `
          : nothing
      }

      <!-- Config hint (for items that need API key) -->
      ${
        item.configHint
          ? html`<div style="
            font-size:10px; color:var(--muted-strong, #6b7d91);
            line-height:1.4; margin-bottom:6px;
            padding:3px 6px;
            background:rgba(251,191,36,0.06);
            border-radius:4px;
            display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;
          ">${item.configHint}</div>`
          : nothing
      }

      <!-- Badges + install button row -->
      <div style="display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:6px; margin-top:auto;">
        ${renderBadges(item)}
        ${renderInstallButton(item, onInstall, onConfigInstall)}
      </div>
    </div>

  `;
}
