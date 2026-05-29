import type { AppViewState } from "../app-view-state";
import { loadConfig } from "./config";
import { cloneConfigObject, serializeConfigForm } from "./config/form-utils";

type PerfProfile = "economy" | "balanced" | "power";

/**
 * 性能档位预设参数表（与后端 defaults.ts 中 PERFORMANCE_PRESETS 保持一致）
 */
const PERFORMANCE_PRESETS: Record<
  PerfProfile,
  {
    thinkingDefault: string;
    contextPruningTtl: string;
    maxConcurrent: number;
    heartbeatEvery: string;
  }
> = {
  economy: {
    thinkingDefault: "low",
    contextPruningTtl: "10m",
    maxConcurrent: 2,
    heartbeatEvery: "1h",
  },
  balanced: {
    thinkingDefault: "medium",
    contextPruningTtl: "1h",
    maxConcurrent: 4,
    heartbeatEvery: "30m",
  },
  power: {
    thinkingDefault: "high",
    contextPruningTtl: "2h",
    maxConcurrent: 6,
    heartbeatEvery: "10m",
  },
};

/**
 * 从 configSnapshot 中读取当前 performanceProfile。
 * 如果没有存储过，返回 "power" 作为默认值。
 */
export function resolvePerformanceProfile(state: AppViewState): PerfProfile {
  const config = state.configSnapshot?.config as Record<string, unknown> | null;
  const meta = config?.meta as Record<string, unknown> | undefined;
  const stored = meta?.performanceProfile;
  if (stored === "economy" || stored === "balanced" || stored === "power") {
    return stored;
  }
  return "power";
}

/**
 * 从 configSnapshot 同步 performanceProfile 到 UI 状态。
 * 在 chat 页面加载、连接建立后调用。
 */
export async function syncPerformanceProfile(state: AppViewState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (!state.configSnapshot?.hash) {
    await loadConfig(state as never);
  }
  state.performanceProfile = resolvePerformanceProfile(state);
}

/**
 * 切换性能档位：
 * 1. 乐观更新 UI 状态
 * 2. 将 profile 预设参数写入 config 对象
 * 3. 通过 config.apply 持久化并热重载
 * 4. 失败时回滚 UI 状态
 */
export async function applyPerformanceProfile(
  state: AppViewState,
  profile: PerfProfile,
): Promise<void> {
  if (!state.client || !state.connected) return;

  const previous = state.performanceProfile;
  const preset = PERFORMANCE_PRESETS[profile];

  // 1. 乐观更新 UI
  state.performanceProfile = profile;
  state.performanceProfileSaving = true;

  try {
    // 内部构建并发送 config.apply 的逻辑（可重试）
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

      // meta.performanceProfile
      if (!config.meta || typeof config.meta !== "object") config.meta = {};
      (config.meta as Record<string, unknown>).performanceProfile = profile;

      // agents.defaults 各字段
      if (!config.agents || typeof config.agents !== "object") config.agents = {};
      const agents = config.agents as Record<string, unknown>;
      if (!agents.defaults || typeof agents.defaults !== "object") agents.defaults = {};
      const defaults = agents.defaults as Record<string, unknown>;

      defaults.thinkingDefault = preset.thinkingDefault;
      defaults.maxConcurrent = preset.maxConcurrent;

      // contextPruning.ttl
      if (!defaults.contextPruning || typeof defaults.contextPruning !== "object") {
        defaults.contextPruning = {};
      }
      (defaults.contextPruning as Record<string, unknown>).ttl = preset.contextPruningTtl;

      // heartbeat.every
      if (!defaults.heartbeat || typeof defaults.heartbeat !== "object") {
        defaults.heartbeat = {};
      }
      (defaults.heartbeat as Record<string, unknown>).every = preset.heartbeatEvery;

      const raw = serializeConfigForm(config);
      await state.client!.request("config.apply", {
        raw,
        baseHash,
        sessionKey: state.sessionKey,
        noRestart: true,
      });
    };

    // 2. 首次尝试
    try {
      await buildAndApply();
    } catch (firstErr) {
      // config changed since last load → 自动重新加载最新 config 再重试一次
      if (String(firstErr).includes("config changed since last load")) {
        await loadConfig(state as never);
        await buildAndApply();
      } else {
        throw firstErr;
      }
    }

    // 3. 重置 configForm 脏标记，确保 loadConfig → applyConfigSnapshot 能刷新表单基线
    state.configFormDirty = false;

    // 4. 重新加载 config snapshot（config.apply 响应不含 hash，需要重新 get）
    await loadConfig(state as never);
  } catch (err) {
    // 回滚
    state.performanceProfile = previous;
    state.lastError = String(err);
  } finally {
    state.performanceProfileSaving = false;
  }
}
