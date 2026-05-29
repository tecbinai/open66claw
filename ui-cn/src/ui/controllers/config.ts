import type { GatewayBrowserClient } from "../gateway";
import { t } from "../i18n/index.js";
import type { ConfigSchemaResponse, ConfigSnapshot, ConfigUiHints } from "../types";
import {
  cloneConfigObject,
  removePathValue,
  serializeConfigForm,
  setPathValue,
  shallowCloneAtPath,
} from "./config/form-utils";

export type ConfigState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  applySessionKey: string;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown | null;
  configSchemaVersion: string | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormDirty: boolean;
  configFormMode: "form" | "raw";
  configSearchQuery: string;
  configActiveSection: string | null;
  configActiveSubsection: string | null;
  lastError: string | null;
};

export async function loadConfig(state: ConfigState) {
  if (!state.client || !state.connected) return;
  state.configLoading = true;
  state.lastError = null;
  try {
    const res = (await state.client.request("config.get", {})) as ConfigSnapshot;
    applyConfigSnapshot(state, res);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configLoading = false;
  }
}

export async function loadConfigSchema(state: ConfigState) {
  if (!state.client || !state.connected) return;
  if (state.configSchemaLoading) return;
  state.configSchemaLoading = true;
  try {
    const res = (await state.client.request("config.schema", {})) as ConfigSchemaResponse;
    applyConfigSchema(state, res);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configSchemaLoading = false;
  }
}

export function applyConfigSchema(state: ConfigState, res: ConfigSchemaResponse) {
  state.configSchema = res.schema ?? null;
  state.configUiHints = res.uiHints ?? {};
  state.configSchemaVersion = res.version ?? null;
}

export function applyConfigSnapshot(state: ConfigState, snapshot: ConfigSnapshot) {
  state.configSnapshot = snapshot;
  const rawFromSnapshot =
    typeof snapshot.raw === "string"
      ? snapshot.raw
      : snapshot.config && typeof snapshot.config === "object"
        ? serializeConfigForm(snapshot.config as Record<string, unknown>)
        : state.configRaw;
  if (!state.configFormDirty || state.configFormMode === "raw") {
    state.configRaw = rawFromSnapshot;
  } else if (state.configForm) {
    state.configRaw = serializeConfigForm(state.configForm);
  } else {
    state.configRaw = rawFromSnapshot;
  }
  state.configValid = typeof snapshot.valid === "boolean" ? snapshot.valid : null;
  state.configIssues = Array.isArray(snapshot.issues) ? snapshot.issues : [];

  if (!state.configFormDirty) {
    state.configForm = cloneConfigObject(snapshot.config ?? {});
    state.configFormOriginal = cloneConfigObject(snapshot.config ?? {});
    state.configRawOriginal = rawFromSnapshot;
  }
}

/** Fields written by backend methods (e.g. route.setChannelAgent) that the
 *  form UI does not manage. We must preserve them when doing a full config.set
 *  so we don't accidentally clobber backend-written data. */
const PRESERVE_KEYS = ["bindings"];

/** Merge PRESERVE_KEYS from a config snapshot into a form-based config object. */
function mergePreservedKeys(
  form: Record<string, unknown>,
  snapshot: unknown,
): Record<string, unknown> {
  const merged = { ...form };
  if (snapshot && typeof snapshot === "object") {
    for (const key of PRESERVE_KEYS) {
      if (key in (snapshot as Record<string, unknown>) && !(key in merged)) {
        (merged as Record<string, unknown>)[key] = (snapshot as Record<string, unknown>)[key];
      }
    }
  }
  return merged;
}

export async function saveConfig(state: ConfigState) {
  if (!state.client || !state.connected) {
    state.lastError = t("config.error.notConnected");
    return;
  }
  state.configSaving = true;
  state.lastError = null;
  try {
    // Reload the latest config from disk BEFORE building the save payload.
    // This is critical: route.setChannelAgent writes bindings directly to the
    // config file. If we use a stale configSnapshot, those bindings would be
    // missing and the full-overwrite config.set would clobber them.
    await loadConfig(state);

    let raw: string;
    if (state.configFormMode === "form" && state.configForm) {
      raw = serializeConfigForm(
        mergePreservedKeys(state.configForm, state.configSnapshot?.config),
      );
    } else {
      raw = state.configRaw ?? "";
    }
    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.lastError = t("config.error.hashMissing");
      return;
    }
    try {
      await state.client.request("config.set", { raw, baseHash });
    } catch (firstErr) {
      // config hash mismatch → reload fresh and retry
      if (String(firstErr).includes("config changed since last load")) {
        await loadConfig(state);
        const retryHash = state.configSnapshot?.hash;
        if (retryHash) {
          if (state.configFormMode === "form" && state.configForm) {
            raw = serializeConfigForm(
              mergePreservedKeys(state.configForm, state.configSnapshot?.config),
            );
          }
          await state.client.request("config.set", { raw, baseHash: retryHash });
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }
    state.configFormDirty = false;
    await loadConfig(state);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configSaving = false;
  }
}

export async function applyConfig(state: ConfigState) {
  if (!state.client || !state.connected) return;
  state.configApplying = true;
  state.lastError = null;
  try {
    // Reload fresh config to preserve backend-written fields (bindings etc.)
    await loadConfig(state);

    let raw =
      state.configFormMode === "form" && state.configForm
        ? serializeConfigForm(
            mergePreservedKeys(state.configForm, state.configSnapshot?.config),
          )
        : state.configRaw;
    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.lastError = t("config.error.hashMissing");
      return;
    }
    try {
      await state.client.request("config.apply", {
        raw,
        baseHash,
        sessionKey: state.applySessionKey,
      });
    } catch (firstErr) {
      if (String(firstErr).includes("config changed since last load")) {
        await loadConfig(state);
        const retryHash = state.configSnapshot?.hash;
        if (retryHash) {
          if (state.configFormMode === "form" && state.configForm) {
            raw = serializeConfigForm(
              mergePreservedKeys(state.configForm, state.configSnapshot?.config),
            );
          }
          await state.client.request("config.apply", {
            raw,
            baseHash: retryHash,
            sessionKey: state.applySessionKey,
          });
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }
    state.configFormDirty = false;
    await loadConfig(state);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configApplying = false;
  }
}

export async function runUpdate(state: ConfigState) {
  if (!state.client || !state.connected) return;
  state.updateRunning = true;
  state.lastError = null;
  try {
    await state.client.request("update.run", {
      sessionKey: state.applySessionKey,
    });
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.updateRunning = false;
  }
}

export function updateConfigFormValue(
  state: ConfigState,
  path: Array<string | number>,
  value: unknown,
) {
  // Use shallow clone along the path instead of full deep clone
  const source = state.configForm ?? state.configSnapshot?.config ?? {};
  const base = shallowCloneAtPath(source as Record<string, unknown>, path);
  setPathValue(base, path, value);
  state.configForm = base;
  state.configFormDirty = true;
  if (state.configFormMode === "form") {
    state.configRaw = serializeConfigForm(base);
  }
}

export function removeConfigFormValue(state: ConfigState, path: Array<string | number>) {
  const base = cloneConfigObject(state.configForm ?? state.configSnapshot?.config ?? {});
  removePathValue(base, path);
  state.configForm = base;
  state.configFormDirty = true;
  if (state.configFormMode === "form") {
    state.configRaw = serializeConfigForm(base);
  }
}
