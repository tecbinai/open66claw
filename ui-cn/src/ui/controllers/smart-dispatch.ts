import type { AppViewState } from "../app-view-state";
import { loadConfig } from "./config";
import { cloneConfigObject, serializeConfigForm } from "./config/form-utils";

/**
 * 从 configSnapshot 中读取 dispatch.enabled 的值。
 * 出厂默认 false（关闭），用户通过 UI 开关控制。
 */
export function resolveSmartDispatch(state: AppViewState): boolean {
  const config = state.configSnapshot?.config as Record<string, unknown> | null;
  const dispatch = config?.dispatch as Record<string, unknown> | undefined;
  if (dispatch && typeof dispatch.enabled === "boolean") {
    return dispatch.enabled;
  }
  return false;
}

/**
 * 从 configSnapshot 同步 smartDispatchEnabled 到 UI 状态。
 */
export async function syncSmartDispatch(state: AppViewState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (!state.configSnapshot?.hash) {
    await loadConfig(state as never);
  }
  state.smartDispatchEnabled = resolveSmartDispatch(state);
}

/**
 * 切换智能推荐：
 * 1. 乐观更新 UI
 * 2. 写入 dispatch.enabled + dispatch.toolFilterMode 到 config
 * 3. 通过 config.apply 持久化并热重载
 * 4. 失败时回滚
 */
export async function toggleSmartDispatch(state: AppViewState, enabled: boolean): Promise<void> {
  if (!state.client || !state.connected) return;

  const previous = state.smartDispatchEnabled;

  // 1. 乐观更新
  state.smartDispatchEnabled = enabled;
  state.smartDispatchSaving = true;

  try {
    const buildAndApply = async () => {
      if (!state.configSnapshot?.hash) {
        await loadConfig(state as never);
      }
      const snapshot = state.configSnapshot;
      const baseHash = snapshot?.hash;
      if (!baseHash) {
        throw new Error("Config hash not available");
      }

      const config = cloneConfigObject(snapshot?.config ?? {});

      // dispatch 对象
      if (!config.dispatch || typeof config.dispatch !== "object") {
        config.dispatch = {};
      }
      const dispatch = config.dispatch as Record<string, unknown>;
      dispatch.enabled = enabled;

      // 开启时恢复 toolFilterMode 为 discovery，关闭时设为 off
      // 注意：不碰 modalityRouter（多模态路由独立于 dispatch，默认始终开启）
      //       不碰 toolSelector（跟随 dispatch.enabled 联动，不需要单独控制）
      dispatch.toolFilterMode = enabled ? "discovery" : "off";

      const raw = serializeConfigForm(config);
      await state.client!.request("config.apply", {
        raw,
        baseHash,
        sessionKey: state.sessionKey,
        // dispatch 字段写入后 loadConfig() 即刻热生效，无需 SIGUSR1 重启
        noRestart: true,
      });
    };

    try {
      await buildAndApply();
    } catch (firstErr) {
      if (String(firstErr).includes("config changed since last load")) {
        await loadConfig(state as never);
        await buildAndApply();
      } else {
        throw firstErr;
      }
    }

    state.configFormDirty = false;
    await loadConfig(state as never);
  } catch (err) {
    state.smartDispatchEnabled = previous;
    state.lastError = String(err);
  } finally {
    state.smartDispatchSaving = false;
  }
}
