import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createCnLogger } from "../utils/index.js";

// ============================================================
// Types
// ============================================================

export interface CnAdapterState {
  dataVersion: number;
  lastActiveAt: string; // ISO 8601
  installedAt: string; // ISO 8601
  /** CN 配置迁移版本号（从 cnPlugin.configVersion 迁移而来） */
  configVersion?: number;
  /** CN 专有配置（locale, mirror, securityTier 等） */
  cnConfig?: {
    locale?: string;
    mirror?: { npm?: string; pip?: string };
    securityTier?: string;
    models?: Record<string, unknown>;
    proxy?: { enabled?: boolean };
    telemetry?: boolean;
    updateChannel?: string;
  };
}

export interface DataMigrationStep {
  version: number;
  description: string;
  migrate: (statePath: string) => Promise<void>;
}

// ============================================================
// 迁移表
// ============================================================

/**
 * cn-adapter 内部数据迁移步骤。
 * 只追加真实需求，不预填虚构步骤。
 */
export const CN_DATA_MIGRATIONS: DataMigrationStep[] = [
  {
    version: 1,
    description: "初始化 cn-adapter-state.json",
    migrate: async (statePath: string) => {
      // state 文件由 runDataMigrations 在写入 dataVersion 时创建
      // 这里只需确保目录存在
      mkdirSync(dirname(statePath), { recursive: true });
    },
  },
  // 后续有真实需求时在这里追加
];

// ============================================================
// 核心函数
// ============================================================

/**
 * 解析 cn-adapter state 文件路径。
 * 路径：~/.openclaw/cn-adapter-state.json（与 config-path.ts 一致）
 */
export function resolveStatePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || join(home, ".openclaw");
  return join(stateDir, "cn-adapter-state.json");
}

/**
 * 读取当前 state 文件。不存在则返回 null。
 */
export function readState(statePath: string): CnAdapterState | null {
  try {
    if (!existsSync(statePath)) return null;
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as CnAdapterState;
  } catch {
    return null;
  }
}

/**
 * 写入 state 文件（直接 writeFileSync，state 文件很小）。
 */
export function writeState(statePath: string, state: CnAdapterState): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * 执行 cn-adapter 内部数据迁移。
 * 迁移失败不阻止启动，降级运行 + 日志告警。
 */
export async function runDataMigrations(
  statePath?: string,
): Promise<{ applied: number[]; skipped: number[] }> {
  const log = createCnLogger("data-migration");
  const resolvedPath = statePath ?? resolveStatePath();

  const applied: number[] = [];
  const skipped: number[] = [];

  let state = readState(resolvedPath);
  const currentVersion = state?.dataVersion ?? 0;

  for (const step of CN_DATA_MIGRATIONS) {
    if (step.version <= currentVersion) {
      skipped.push(step.version);
      continue;
    }

    try {
      await step.migrate(resolvedPath);
      applied.push(step.version);
      log.info(`数据迁移 v${step.version}: ${step.description}`);
    } catch (err) {
      log.warn(
        `数据迁移 v${step.version} 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      // 迁移失败不阻止启动，停止后续迁移
      break;
    }
  }

  // 更新 state 文件
  if (applied.length > 0) {
    const now = new Date().toISOString();
    const newVersion = applied[applied.length - 1];
    const updatedState: CnAdapterState = {
      dataVersion: newVersion,
      lastActiveAt: now,
      installedAt: state?.installedAt ?? now,
    };
    try {
      writeState(resolvedPath, updatedState);
    } catch (err) {
      log.warn(`写入 state 文件失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (state) {
    // 无迁移但 state 存在，更新 lastActiveAt
    try {
      writeState(resolvedPath, {
        ...state,
        lastActiveAt: new Date().toISOString(),
      });
    } catch {
      // 静默忽略
    }
  }

  return { applied, skipped };
}

// ============================================================
// configVersion 便捷读写（从 cn-adapter-state.json 管理）
// ============================================================

/**
 * 从 cn-adapter-state.json 读取 configVersion。
 * 如果 state 文件不存在或无 configVersion，返回 0。
 */
export function getConfigVersionFromState(statePath?: string): number {
  const resolved = statePath ?? resolveStatePath();
  const state = readState(resolved);
  return state?.configVersion ?? 0;
}

/**
 * 从 openclaw.json config 对象读取旧版 cnPlugin.configVersion（向后兼容）。
 * 新安装不会存在此字段。
 */
export function getConfigVersionFromLegacyCnPlugin(config: Record<string, unknown>): number {
  const cnPlugin = config.cnPlugin as Record<string, unknown> | undefined;
  if (!cnPlugin || typeof cnPlugin.configVersion !== "number") {
    return 0;
  }
  return cnPlugin.configVersion;
}

/**
 * 读取当前 configVersion。
 * 优先从 cn-adapter-state.json 读，回退到 openclaw.json 的 cnPlugin.configVersion。
 */
export function getCurrentConfigVersion(
  config: Record<string, unknown>,
  statePath?: string,
): number {
  // 优先 state 文件
  const fromState = getConfigVersionFromState(statePath);
  if (fromState > 0) return fromState;
  // 向后兼容：老用户的 configVersion 在 openclaw.json root
  return getConfigVersionFromLegacyCnPlugin(config);
}

/**
 * 将 configVersion 写入 cn-adapter-state.json。
 */
export function setConfigVersionInState(version: number, statePath?: string): void {
  const resolved = statePath ?? resolveStatePath();
  const state = readState(resolved);
  const now = new Date().toISOString();
  writeState(resolved, {
    dataVersion: state?.dataVersion ?? 0,
    lastActiveAt: now,
    installedAt: state?.installedAt ?? now,
    configVersion: version,
    cnConfig: state?.cnConfig,
  });
}

/**
 * 将 CN 专有配置写入 cn-adapter-state.json。
 */
export function setCnConfigInState(
  cnConfig: CnAdapterState["cnConfig"],
  statePath?: string,
): void {
  const resolved = statePath ?? resolveStatePath();
  const state = readState(resolved);
  const now = new Date().toISOString();
  writeState(resolved, {
    dataVersion: state?.dataVersion ?? 0,
    lastActiveAt: now,
    installedAt: state?.installedAt ?? now,
    configVersion: state?.configVersion,
    cnConfig,
  });
}

/**
 * 从 openclaw.json 提取 cnPlugin 值并迁移到 state 文件，
 * 然后返回清理掉 cnPlugin 后的 config。
 * 用于老用户首次升级时一次性迁移。
 */
export function migrateCnPluginToState(
  config: Record<string, unknown>,
  statePath?: string,
): Record<string, unknown> {
  const cnPlugin = config.cnPlugin as Record<string, unknown> | undefined;
  if (!cnPlugin) return config;

  const resolved = statePath ?? resolveStatePath();
  const state = readState(resolved);
  const now = new Date().toISOString();

  // 提取 cnPlugin 的值到 state
  const configVersion = typeof cnPlugin.configVersion === "number" ? cnPlugin.configVersion : 0;
  const cnConfig: CnAdapterState["cnConfig"] = {};

  if (typeof cnPlugin.locale === "string") cnConfig.locale = cnPlugin.locale;
  if (typeof cnPlugin.securityTier === "string") cnConfig.securityTier = cnPlugin.securityTier;
  if (typeof cnPlugin.telemetry === "boolean") cnConfig.telemetry = cnPlugin.telemetry;
  if (typeof cnPlugin.updateChannel === "string") cnConfig.updateChannel = cnPlugin.updateChannel;
  if (cnPlugin.mirror && typeof cnPlugin.mirror === "object") {
    cnConfig.mirror = cnPlugin.mirror as { npm?: string; pip?: string };
  }
  if (cnPlugin.proxy && typeof cnPlugin.proxy === "object") {
    cnConfig.proxy = cnPlugin.proxy as { enabled?: boolean };
  }
  if (cnPlugin.models && typeof cnPlugin.models === "object") {
    cnConfig.models = cnPlugin.models as Record<string, unknown>;
  }

  writeState(resolved, {
    dataVersion: state?.dataVersion ?? 0,
    lastActiveAt: now,
    installedAt: state?.installedAt ?? now,
    configVersion,
    cnConfig: Object.keys(cnConfig).length > 0 ? cnConfig : state?.cnConfig,
  });

  // 返回清理掉 cnPlugin 的 config
  const cleaned = structuredClone(config);
  delete cleaned.cnPlugin;
  return cleaned;
}
