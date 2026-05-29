import { html } from "lit";
import { t } from "../i18n/index.js";
import type { ConfigUiHints } from "../types";
import type { ChannelsProps } from "./channels.types";
import { analyzeConfigSchema, renderNode, schemaType, type JsonSchema } from "./config-form";

type ChannelConfigFormProps = {
  channelId: string;
  configValue: Record<string, unknown> | null;
  schema: unknown | null;
  uiHints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

export function resolveSchemaNode(
  schema: JsonSchema | null,
  path: Array<string | number>,
): JsonSchema | null {
  let current = schema;
  for (const key of path) {
    if (!current) return null;
    const type = schemaType(current);
    if (type === "object") {
      const properties = current.properties ?? {};
      if (typeof key === "string" && properties[key]) {
        current = properties[key];
        continue;
      }
      const additional = current.additionalProperties;
      if (typeof key === "string" && additional && typeof additional === "object") {
        current = additional as JsonSchema;
        continue;
      }
      return null;
    }
    if (type === "array") {
      if (typeof key !== "number") return null;
      const items = Array.isArray(current.items) ? current.items[0] : current.items;
      current = items ?? null;
      continue;
    }
    return null;
  }
  return current;
}

export function resolveChannelValue(
  config: Record<string, unknown>,
  channelId: string,
): Record<string, unknown> {
  const channels = (config.channels ?? {}) as Record<string, unknown>;
  const fromChannels = channels[channelId];
  const fallback = config[channelId];
  const resolved =
    (fromChannels && typeof fromChannels === "object"
      ? (fromChannels as Record<string, unknown>)
      : null) ??
    (fallback && typeof fallback === "object" ? (fallback as Record<string, unknown>) : null);
  return resolved ?? {};
}

/**
 * Resolve config values for a specific account within a channel.
 * For a new bot, returns empty object (clean form).
 * For existing bots, merges base channel config with account-specific overrides.
 */
export function resolveAccountValue(
  config: Record<string, unknown>,
  channelId: string,
  accountId: string | null,
  isNew: boolean,
): Record<string, unknown> {
  if (isNew) {
    return {};
  }

  const channels = (config.channels ?? {}) as Record<string, unknown>;
  const channelConfig = channels[channelId];
  if (!channelConfig || typeof channelConfig !== "object") {
    return {};
  }
  const cc = channelConfig as Record<string, unknown>;

  if (!accountId || accountId === "default") {
    // Check if default account exists in accounts dict
    const accounts = cc.accounts as Record<string, unknown> | undefined;
    if (
      accounts &&
      typeof accounts === "object" &&
      accounts["default"] &&
      typeof accounts["default"] === "object"
    ) {
      const { accounts: _ignored, ...base } = cc;
      const acct = accounts["default"] as Record<string, unknown>;
      return { ...base, ...acct };
    }
    // Fallback to top-level channel config
    return cc;
  }

  // Non-default account: merge base + account
  const { accounts: _ignored, ...base } = cc;
  const accounts = (cc.accounts ?? {}) as Record<string, unknown>;
  const acct = accounts[accountId];
  if (acct && typeof acct === "object") {
    return { ...base, ...(acct as Record<string, unknown>) };
  }
  return base;
}

/**
 * Compute the config patch path for wizard form fields.
 * Determines where in the config tree the wizard should write values.
 */
export function resolveWizardFormPath(
  config: Record<string, unknown>,
  channelId: string,
  accountId: string | null,
  isNew: boolean,
): Array<string | number> {
  if (!accountId || accountId === "default") {
    // Default account: check if accounts dict already exists
    const channels = (config.channels ?? {}) as Record<string, unknown>;
    const channelConfig = channels[channelId] as Record<string, unknown> | undefined;
    const accounts = channelConfig?.accounts as Record<string, unknown> | undefined;

    const hasAccounts =
      accounts && typeof accounts === "object" && Object.keys(accounts).length > 0;
    if (hasAccounts && (accounts["default"] || isNew)) {
      return ["channels", channelId, "accounts", "default"];
    }
    // No accounts dict yet, use top-level (backward compat for first/default bot)
    return ["channels", channelId];
  }

  // Non-default account always goes into accounts dict
  return ["channels", channelId, "accounts", accountId];
}

const EXTRA_CHANNEL_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function formatExtraValue(raw: unknown): string {
  if (raw == null) return t("common.na");
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return t("common.na");
  }
}

function renderExtraChannelFields(value: Record<string, unknown>) {
  const entries = EXTRA_CHANNEL_FIELDS.flatMap((field) => {
    if (!(field in value)) return [];
    return [[field, value[field]]] as Array<[string, unknown]>;
  });
  if (entries.length === 0) return null;
  return html`
    <div class="status-list" style="margin-top: 12px;">
      ${entries.map(
        ([field, raw]) => html`
          <div>
            <span class="label">${field}</span>
            <span>${formatExtraValue(raw)}</span>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChannelConfigForm(props: ChannelConfigFormProps) {
  const analysis = analyzeConfigSchema(props.schema);
  const normalized = analysis.schema;
  if (!normalized) {
    return html`<div class="config-hint">
      <span class="config-hint__icon">💡</span>
      <span class="config-hint__text">${t("config.unsupportedSchema")}</span>
    </div>`;
  }
  const node = resolveSchemaNode(normalized, ["channels", props.channelId]);
  if (!node) {
    return html`<div class="muted">${t("config.schemaUnavailable")}</div>`;
  }
  const configValue = props.configValue ?? {};
  const value = resolveChannelValue(configValue, props.channelId);
  return html`
    <div class="config-form">
      ${renderNode({
        schema: node,
        value,
        path: ["channels", props.channelId],
        hints: props.uiHints,
        unsupported: new Set(analysis.unsupportedPaths),
        disabled: props.disabled,
        showLabel: false,
        onPatch: props.onPatch,
      })}
    </div>
    ${renderExtraChannelFields(value)}
  `;
}

export function renderChannelConfigSection(params: { channelId: string; props: ChannelsProps }) {
  const { channelId, props } = params;
  const disabled = props.configSaving || props.configSchemaLoading;
  return html`
    <div style="margin-top: 16px;">
      ${
        props.configSchemaLoading
          ? html`<div class="muted">${t("config.loadingSchema")}</div>`
          : renderChannelConfigForm({
              channelId,
              configValue: props.configForm,
              schema: props.configSchema,
              uiHints: props.configUiHints,
              disabled,
              onPatch: props.onConfigPatch,
            })
      }
      <div class="row" style="margin-top: 12px;">
        <button
          class="btn primary"
          ?disabled=${disabled || !props.configFormDirty}
          @click=${() => props.onConfigSave()}
        >
          ${props.configSaving ? t("config.applying") : t("common.save")}
        </button>
        <button
          class="btn"
          ?disabled=${disabled}
          @click=${() => props.onConfigReload()}
        >
          ${t("common.refresh")}
        </button>
      </div>
    </div>
  `;
}
