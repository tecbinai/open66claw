import type { ClawdbotApp } from "./app";
import {
  loadChannels,
  logoutWhatsApp,
  startWhatsAppLogin,
  waitWhatsAppLogin,
} from "./controllers/channels";
import { loadConfig, removeConfigFormValue, saveConfig } from "./controllers/config";
import type { NostrProfile } from "./types";
import { createNostrProfileFormState } from "./views/channels.nostr-profile-form";

export async function handleWhatsAppStart(host: ClawdbotApp, force: boolean) {
  await startWhatsAppLogin(host, force);
  await loadChannels(host, true);
}

export async function handleWhatsAppWait(host: ClawdbotApp) {
  await waitWhatsAppLogin(host);
  await loadChannels(host, true);
}

export async function handleWhatsAppLogout(host: ClawdbotApp) {
  await logoutWhatsApp(host);
  await loadChannels(host, true);
}

/**
 * Collect all appIds from a channel's config (top-level + accounts dict),
 * returning a map of accountId → appId.
 */
function collectExistingAppIds(
  cfg: Record<string, any>,
  channelId: string,
): Map<string, string> {
  const result = new Map<string, string>();
  const cc = cfg?.channels?.[channelId];
  if (!cc || typeof cc !== "object") return result;

  const REDACTED = "__OPENCLAW_REDACTED__";

  // Top-level appId → "default" account
  if (typeof cc.appId === "string" && cc.appId && cc.appId !== REDACTED) {
    result.set("default", cc.appId);
  }

  // accounts dict
  const accounts = cc.accounts;
  if (accounts && typeof accounts === "object") {
    for (const [acctId, acctCfg] of Object.entries(accounts)) {
      if (!acctCfg || typeof acctCfg !== "object") continue;
      const appId = (acctCfg as Record<string, unknown>).appId;
      if (typeof appId === "string" && appId && appId !== REDACTED) {
        result.set(acctId, appId);
      }
    }
  }

  return result;
}

export async function handleChannelConfigSave(host: ClawdbotApp) {
  console.log("[channels] handleChannelConfigSave START");
  try {
    // ── Duplicate App ID check ──────────────────────────────
    const channelId = host.channelsSelectedKey;
    const currentAccountId = host.channelsWizardAccountId ?? "default";
    if (channelId) {
      const cfg = (host.configForm ?? host.configSnapshot?.config ?? {}) as Record<string, any>;
      const existingAppIds = collectExistingAppIds(cfg, channelId);

      // Get the appId being saved from the form
      const cc = cfg?.channels?.[channelId];
      let newAppId: string | undefined;
      if (cc && typeof cc === "object") {
        const accounts = cc.accounts;
        if (accounts && typeof accounts === "object" && accounts[currentAccountId]) {
          const acct = accounts[currentAccountId] as Record<string, unknown>;
          if (typeof acct.appId === "string") newAppId = acct.appId.trim();
        }
        if (!newAppId && currentAccountId === "default" && typeof cc.appId === "string") {
          newAppId = cc.appId.trim();
        }
      }

      if (newAppId) {
        for (const [existingAcctId, existingAppId] of existingAppIds) {
          if (existingAcctId === currentAccountId) continue; // skip self
          if (existingAppId === newAppId) {
            host.lastError = `App ID "${newAppId}" 已被其他 Bot（${existingAcctId}）使用，不能重复添加`;
            host.requestUpdate();
            return;
          }
        }
      }
    }

    console.log("[channels] saving config...");
    await saveConfig(host);
    if (host.lastError) {
      console.error("[channels] saveConfig failed:", host.lastError);
      host.requestUpdate();
      return;
    }
    console.log("[channels] config saved OK, reloading config...");
    await loadConfig(host);

    // After saving channel config, explicitly restart the channel so it picks
    // up the new credentials and starts running (WebSocket long-connection etc.).
    // The config file watcher may not trigger a restart if the values haven't
    // changed since the last write, so we do it explicitly here.
    if (channelId && host.client && host.connected) {
      console.log("[channels] restarting channel:", channelId);
      try {
        await host.client.request("channels.restart", {
          channel: channelId,
          accountId: host.channelsWizardAccountId ?? undefined,
        });
        console.log("[channels] channel restarted OK");
      } catch (restartErr) {
        console.warn("[channels] channel restart failed (non-fatal):", restartErr);
      }
    }

    console.log("[channels] probing channels...");
    await loadChannels(host, true);

    // Close wizard on successful save and probe
    console.log("[channels] probe done, closing wizard");
    host.channelsWizardOpen = false;
    host.channelsWizardAccountId = null;
    host.channelsWizardIsNew = false;
  } catch (err) {
    console.error("[channels] handleChannelConfigSave ERROR:", err);
    host.lastError = String(err);
  } finally {
    host.requestUpdate();
    console.log("[channels] handleChannelConfigSave END, lastError=", host.lastError);
  }
}

export async function handleChannelConfigReload(host: ClawdbotApp) {
  await loadConfig(host);
  await loadChannels(host, true);
}

export async function handleDeleteBot(host: ClawdbotApp, channelId: string, accountId: string) {
  if (!host.client || !host.connected) return;

  (host as Record<string, unknown>).channelDeletingBotId = accountId;
  host.requestUpdate();

  try {
    // Stop the channel account first
    try {
      await host.client.request("channels.restart", {
        channel: channelId,
        accountId,
        action: "stop",
      });
    } catch {
      // Best effort — account may already be stopped
    }

    // Clear route bindings for this bot
    try {
      await host.client.request("route.setChannelAgent", {
        channel: channelId,
        accountId,
        agentId: null,
      });
    } catch {
      // Best effort
    }

    // Remove account from config and save
    const cfg = (host.configForm ?? host.configSnapshot?.config ?? {}) as Record<string, any>;
    const cc = cfg?.channels?.[channelId];
    if (cc && typeof cc === "object") {
      const normalizedId = accountId === "default" ? "default" : accountId;
      if (cc.accounts && typeof cc.accounts === "object" && cc.accounts[normalizedId]) {
        // Account is in accounts dict — remove it
        removeConfigFormValue(host, ["channels", channelId, "accounts", normalizedId]);
        await saveConfig(host);
        await loadConfig(host);
      } else if (normalizedId === "default" && cc.appId) {
        // Default account stored at top-level — clear credential fields
        removeConfigFormValue(host, ["channels", channelId, "appId"]);
        removeConfigFormValue(host, ["channels", channelId, "appSecret"]);
        removeConfigFormValue(host, ["channels", channelId, "encryptKey"]);
        removeConfigFormValue(host, ["channels", channelId, "verificationToken"]);
        await saveConfig(host);
        await loadConfig(host);
      }
    }

    // Reload
    await loadChannels(host, false);
  } catch (err) {
    host.lastError = `Failed to delete bot: ${String(err)}`;
  } finally {
    (host as Record<string, unknown>).channelDeletingBotId = null;
    host.requestUpdate();
  }
}

function parseValidationErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  const errors: Record<string, string> = {};
  for (const entry of details) {
    if (typeof entry !== "string") continue;
    const [rawField, ...rest] = entry.split(":");
    if (!rawField || rest.length === 0) continue;
    const field = rawField.trim();
    const message = rest.join(":").trim();
    if (field && message) errors[field] = message;
  }
  return errors;
}

function resolveNostrAccountId(host: ClawdbotApp): string {
  const accounts = host.channelsSnapshot?.channelAccounts?.nostr ?? [];
  return accounts[0]?.accountId ?? host.nostrProfileAccountId ?? "default";
}

function buildNostrProfileUrl(accountId: string, suffix = ""): string {
  return `/api/channels/nostr/${encodeURIComponent(accountId)}/profile${suffix}`;
}

export function handleNostrProfileEdit(
  host: ClawdbotApp,
  accountId: string,
  profile: NostrProfile | null,
) {
  host.nostrProfileAccountId = accountId;
  host.nostrProfileFormState = createNostrProfileFormState(profile ?? undefined);
}

export function handleNostrProfileCancel(host: ClawdbotApp) {
  host.nostrProfileFormState = null;
  host.nostrProfileAccountId = null;
}

export function handleNostrProfileFieldChange(
  host: ClawdbotApp,
  field: keyof NostrProfile,
  value: string,
) {
  const state = host.nostrProfileFormState;
  if (!state) return;
  host.nostrProfileFormState = {
    ...state,
    values: {
      ...state.values,
      [field]: value,
    },
    fieldErrors: {
      ...state.fieldErrors,
      [field]: "",
    },
  };
}

export function handleNostrProfileToggleAdvanced(host: ClawdbotApp) {
  const state = host.nostrProfileFormState;
  if (!state) return;
  host.nostrProfileFormState = {
    ...state,
    showAdvanced: !state.showAdvanced,
  };
}

export async function handleNostrProfileSave(host: ClawdbotApp) {
  const state = host.nostrProfileFormState;
  if (!state || state.saving) return;
  const accountId = resolveNostrAccountId(host);

  host.nostrProfileFormState = {
    ...state,
    saving: true,
    error: null,
    success: null,
    fieldErrors: {},
  };

  try {
    const response = await fetch(buildNostrProfileUrl(accountId), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state.values),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      details?: unknown;
      persisted?: boolean;
    } | null;

    if (!response.ok || data?.ok === false || !data) {
      const errorMessage = data?.error ?? `Profile update failed (${response.status})`;
      host.nostrProfileFormState = {
        ...state,
        saving: false,
        error: errorMessage,
        success: null,
        fieldErrors: parseValidationErrors(data?.details),
      };
      return;
    }

    if (!data.persisted) {
      host.nostrProfileFormState = {
        ...state,
        saving: false,
        error: "Profile publish failed on all relays.",
        success: null,
      };
      return;
    }

    host.nostrProfileFormState = {
      ...state,
      saving: false,
      error: null,
      success: "Profile published to relays.",
      fieldErrors: {},
      original: { ...state.values },
    };
    await loadChannels(host, true);
  } catch (err) {
    host.nostrProfileFormState = {
      ...state,
      saving: false,
      error: `Profile update failed: ${String(err)}`,
      success: null,
    };
  }
}

export async function handleNostrProfileImport(host: ClawdbotApp) {
  const state = host.nostrProfileFormState;
  if (!state || state.importing) return;
  const accountId = resolveNostrAccountId(host);

  host.nostrProfileFormState = {
    ...state,
    importing: true,
    error: null,
    success: null,
  };

  try {
    const response = await fetch(buildNostrProfileUrl(accountId, "/import"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ autoMerge: true }),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      imported?: NostrProfile;
      merged?: NostrProfile;
      saved?: boolean;
    } | null;

    if (!response.ok || data?.ok === false || !data) {
      const errorMessage = data?.error ?? `Profile import failed (${response.status})`;
      host.nostrProfileFormState = {
        ...state,
        importing: false,
        error: errorMessage,
        success: null,
      };
      return;
    }

    const merged = data.merged ?? data.imported ?? null;
    const nextValues = merged ? { ...state.values, ...merged } : state.values;
    const showAdvanced = Boolean(
      nextValues.banner || nextValues.website || nextValues.nip05 || nextValues.lud16,
    );

    host.nostrProfileFormState = {
      ...state,
      importing: false,
      values: nextValues,
      error: null,
      success: data.saved
        ? "Profile imported from relays. Review and publish."
        : "Profile imported. Review and publish.",
      showAdvanced,
    };

    if (data.saved) {
      await loadChannels(host, true);
    }
  } catch (err) {
    host.nostrProfileFormState = {
      ...state,
      importing: false,
      error: `Profile import failed: ${String(err)}`,
      success: null,
    };
  }
}
