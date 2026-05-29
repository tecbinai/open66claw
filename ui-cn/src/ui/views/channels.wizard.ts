/**
 * Channel Config Wizard - Split-pane modal
 * Left: tutorial steps, Right: essential config form + advanced settings
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";
import { resolveSchemaNode, resolveAccountValue, resolveWizardFormPath } from "./channels.config";
import { renderDingtalkTutorial } from "./channels.dingtalk";
import { renderDiscordTutorial } from "./channels.discord";
import { renderFeishuTutorial } from "./channels.feishu";
// ── Tutorial imports (lazy loaded from channel card files) ──────────────────
import { renderGooglechatTutorial } from "./channels.googlechat";
import { renderImessageTutorial } from "./channels.imessage";
import { renderNostrTutorial } from "./channels.nostr";
import { renderOpenclawwechatTutorial } from "./channels.openclawwechat";
import { renderQqbotTutorial } from "./channels.qq";
import { renderSignalTutorial } from "./channels.signal";
import { renderSlackTutorial } from "./channels.slack";
import { renderTelegramTutorial } from "./channels.telegram";
import type { ChannelsProps } from "./channels.types";
import { CHANNEL_LABELS } from "./channels.types";
import { renderWecomTutorial } from "./channels.wecom";
import { renderWhatsappTutorial } from "./channels.whatsapp";
import { analyzeConfigSchema, renderNode, type JsonSchema } from "./config-form";

// ── Essential fields per channel ────────────────────────────────────────────

// Fields hidden from the wizard UI (deprecated / internal)
const HIDDEN_FIELDS: Record<string, string[]> = {
  feishu: ["app"],
};

const ESSENTIAL_FIELDS: Record<string, string[]> = {
  feishu: ["appId", "appSecret", "encryptKey", "verificationToken"],
  dingtalk: ["appKey", "appSecret", "robotToken"],
  wecom: ["corpId", "agentId", "secret", "token", "encodingAESKey"],
  qqbot: ["appId", "appSecret", "token", "publicKey"],
  openclawwechat: ["apiKey"],
  telegram: ["botToken"],
  discord: ["token"],
  whatsapp: [],
  slack: ["botToken", "appToken"],
  googlechat: ["serviceAccount", "serviceAccountFile"],
  signal: ["account", "httpUrl"],
  imessage: ["cliPath", "remoteHost"],
  nostr: ["privateKey", "relays"],
};

// ── Tutorial registry ───────────────────────────────────────────────────────

const TUTORIALS: Record<string, () => TemplateResult | typeof nothing> = {
  feishu: renderFeishuTutorial,
  dingtalk: renderDingtalkTutorial,
  wecom: renderWecomTutorial,
  qqbot: renderQqbotTutorial,
  openclawwechat: renderOpenclawwechatTutorial,
  telegram: renderTelegramTutorial,
  discord: renderDiscordTutorial,
  whatsapp: renderWhatsappTutorial,
  slack: renderSlackTutorial,
  googlechat: renderGooglechatTutorial,
  signal: renderSignalTutorial,
  imessage: renderImessageTutorial,
  nostr: renderNostrTutorial,
};

// ── Schema helpers ──────────────────────────────────────────────────────────

function filterSchemaProperties(schema: JsonSchema, keys: string[], include: boolean): JsonSchema {
  const keySet = new Set(keys);
  const filtered: Record<string, JsonSchema> = {};
  for (const [k, v] of Object.entries(schema.properties ?? {})) {
    const matches = keySet.has(k);
    if (include ? matches : !matches) {
      filtered[k] = v;
    }
  }
  return { ...schema, properties: filtered };
}

// ── Route dropdown for wizard ───────────────────────────────────────────────

function encodeRouteValue(targetType: "agent" | "project", targetId: string): string {
  return `${targetType}:${targetId}`;
}

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

function renderWizardRouteDropdown(channelId: string, props: ChannelsProps) {
  const routes = props.routeSummary;
  const agents = props.routeAgents;
  const projects = props.routeProjects;
  if (!routes) return nothing;

  const hasAgents = agents && agents.length > 0;
  const hasProjects = projects && projects.length > 0;
  if (!hasAgents && !hasProjects) return nothing;

  const accountId = props.channelsWizardAccountId ?? undefined;
  const selfAccountId = accountId ?? "default";
  const currentRoute = routes.find(
    (r) => r.channel === channelId && (r.accountId ?? "default") === selfAccountId,
  );
  const currentValue = currentRoute
    ? encodeRouteValue(currentRoute.targetType as "agent" | "project", currentRoute.targetId)
    : "";

  // Build a map of targets already bound by OTHER accounts on the SAME channel
  const otherBindings = new Map<string, string>(); // encoded route value -> bound account name
  for (const r of routes) {
    if (r.channel !== channelId) continue;
    const routeAccountId = r.accountId ?? "default";
    // Skip the current account's own binding
    if (routeAccountId === selfAccountId) continue;
    const encodedVal = encodeRouteValue(r.targetType as "agent" | "project", r.targetId);
    otherBindings.set(encodedVal, routeAccountId);
  }

  const handleChange = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const decoded = decodeRouteValue(select.value);
    if (decoded) {
      props.onRouteChange(channelId, accountId, decoded.targetId, decoded.targetType);
    } else {
      props.onRouteChange(channelId, accountId, null, "agent");
    }
  };

  // Helper to add conflict warning suffix
  const conflictSuffix = (val: string): string => {
    const bound = otherBindings.get(val);
    if (!bound) return "";
    return ` ${t("channels.route.conflict", { account: bound })}`;
  };

  return html`
    <div class="ch-wizard__route">
      <label class="cfg-field__label">${t("channels.route")}</label>
      <select
        class="ch-wizard__route-select"
        .value=${currentValue}
        ?disabled=${props.routeSaving}
        @change=${handleChange}
      >
        <option value="">${t("channels.route.none")}</option>
        ${
          hasAgents
            ? html`
          <optgroup label="${t("channels.route.agents")}">
            ${agents!.map((a) => {
              const val = encodeRouteValue("agent", a.agentId);
              const warning = conflictSuffix(val);
              return html`<option value=${val} ?selected=${val === currentValue}>${a.name || a.agentId}${warning}</option>`;
            })}
          </optgroup>
        `
            : nothing
        }
        ${
          hasProjects
            ? html`
          <optgroup label="${t("channels.route.projects")}">
            ${projects!.map((p) => {
              const val = encodeRouteValue("project", p.projectId);
              const warning = conflictSuffix(val);
              return html`<option value=${val} ?selected=${val === currentValue}>${p.name}${warning}</option>`;
            })}
          </optgroup>
        `
            : nothing
        }
      </select>
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

// ── Main wizard ─────────────────────────────────────────────────────────────

export function renderChannelWizard(props: ChannelsProps) {
  const channelId = props.channelsSelectedKey;
  if (!channelId) return nothing;

  const label = CHANNEL_LABELS[channelId] ?? channelId;
  const isEditing = !props.channelsWizardIsNew;

  // Resolve schema
  const analysis = analyzeConfigSchema(props.configSchema);
  const normalized = analysis.schema;
  const channelSchema = normalized ? resolveSchemaNode(normalized, ["channels", channelId]) : null;

  // Resolve account-aware config value and form path
  const configValue = props.configForm ?? {};
  const value = resolveAccountValue(
    configValue,
    channelId,
    props.channelsWizardAccountId,
    props.channelsWizardIsNew,
  );
  const formPath = resolveWizardFormPath(
    configValue,
    channelId,
    props.channelsWizardAccountId,
    props.channelsWizardIsNew,
  );

  // Split schema into essential and advanced
  const essentialKeys = ESSENTIAL_FIELDS[channelId] ?? [];
  const hasEssentialFields = essentialKeys.length > 0;

  // Enable save button when essential fields already have values (e.g. pre-loaded from config)
  // even if the form hasn't been modified (configFormDirty is false)
  const hasEssentialValues =
    hasEssentialFields &&
    essentialKeys.some((k) => {
      const v = value[k];
      return v != null && v !== "";
    });

  const essentialSchema =
    channelSchema && hasEssentialFields
      ? filterSchemaProperties(channelSchema, essentialKeys, true)
      : null;
  const hiddenKeys = HIDDEN_FIELDS[channelId] ?? [];
  const advancedExcludeKeys = [...essentialKeys, ...hiddenKeys];
  const advancedSchema = channelSchema
    ? filterSchemaProperties(channelSchema, advancedExcludeKeys, false)
    : null;

  const hasAdvancedFields =
    advancedSchema && Object.keys(advancedSchema.properties ?? {}).length > 0;

  // Tutorial
  const tutorialFn = TUTORIALS[channelId];
  const tutorial = tutorialFn ? tutorialFn() : nothing;

  const disabled = props.configSaving || props.configSchemaLoading;

  const renderFormSection = (schema: JsonSchema | null, sectionValue: unknown) => {
    if (!schema || Object.keys(schema.properties ?? {}).length === 0) return nothing;
    return renderNode({
      schema,
      value: sectionValue,
      path: formPath,
      hints: props.configUiHints,
      unsupported: new Set(analysis.unsupportedPaths),
      disabled,
      showLabel: false,
      onPatch: props.onConfigPatch,
    });
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onWizardClose();
  };

  return html`
    <div class="ch-wizard-overlay" @click=${props.onWizardClose} @keydown=${handleKeydown}>
      <div class="ch-wizard" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="ch-wizard__header">
          <span class="ch-wizard__title">
            ${
              isEditing
                ? t("channels.wizard.editTitle", { channel: label })
                : t("channels.wizard.addTitle", { channel: label })
            }
          </span>
          <button class="ch-wizard__close" aria-label="${t("common.close")}" @click=${props.onWizardClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Body: two columns -->
        <div class="ch-wizard__body">
          <!-- Left: Tutorial -->
          <div class="ch-wizard__tutorial">
            <div class="ch-wizard__tutorial-title">${t("channels.wizard.tutorialTitle")}</div>
            ${tutorial}
          </div>

          <!-- Right: Config form -->
          <div class="ch-wizard__form">
            ${
              props.configSchemaLoading
                ? html`<div class="muted">${t("config.loadingSchema")}</div>`
                : channelSchema
                  ? html`
                  <div class="config-form">
                    <!-- Essential fields -->
                    ${
                      essentialSchema
                        ? html`
                        <div class="ch-wizard__essential">
                          ${renderFormSection(essentialSchema, value)}
                        </div>
                      `
                        : html`
                        <div class="ch-wizard__no-credentials">
                          ${t("channels.wizard.noCredentials")}
                        </div>
                      `
                    }

                    <!-- Route dropdown -->
                    ${renderWizardRouteDropdown(channelId, props)}

                    <!-- Advanced fields -->
                    ${
                      hasAdvancedFields
                        ? html`
                        <details class="ch-wizard__advanced">
                          <summary class="ch-wizard__advanced-toggle">
                            ${t("channels.wizard.advancedSettings")}
                          </summary>
                          <div class="ch-wizard__advanced-body">
                            ${renderFormSection(advancedSchema, value)}
                          </div>
                        </details>
                      `
                        : nothing
                    }
                  </div>
                `
                  : html`<div class="muted">${t("config.schemaUnavailable")}</div>`
            }
          </div>
        </div>

        <!-- Footer -->
        ${
          props.configLastError
            ? html`<div class="ch-wizard__error">${props.configLastError}</div>`
            : nothing
        }
        <div class="ch-wizard__footer">
          <button class="btn" @click=${props.onWizardClose}>
            ${t("common.cancel")}
          </button>
          <button
            class="btn primary"
            ?disabled=${disabled || (!props.configFormDirty && !hasEssentialValues)}
            @click=${() => props.onConfigSave()}
          >
            ${props.configSaving ? t("config.applying") : t("channels.wizard.saveAndProbe")}
          </button>
        </div>
      </div>
    </div>
  `;
}
