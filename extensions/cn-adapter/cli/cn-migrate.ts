import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { Command } from "commander";
import {
  migrateConfig,
  createBackup,
  restoreBackup,
  separateCnPluginFromConfig,
  MIGRATIONS,
} from "../cn-defaults/migration.js";
import {
  getCurrentConfigVersion,
  setConfigVersionInState,
  migrateCnPluginToState,
} from "../cn-defaults/data-migration.js";
import { createCnLogger, resolveDefaultConfigPath } from "../utils/index.js";
import type { CnLogger } from "../utils/index.js";

const log = createCnLogger("migrate");

// ============================================================
// 旧版 openclawcn 配置字段映射
// ============================================================

/** 旧版 ~/.openclawcn/config.json 字段 → 新版 ~/.openclaw/openclaw.json 字段 */
const LEGACY_FIELD_MAP: Record<string, string> = {
  apiKey: "cnPlugin.apiKey",
  model: "cnPlugin.models.default",
  locale: "cnPlugin.locale",
  securityLevel: "cnPlugin.securityTier",
  "mirror.npm": "cnPlugin.mirror.npm",
  "mirror.pip": "cnPlugin.mirror.pip",
  proxy: "cnPlugin.proxy",
  telemetry: "cnPlugin.telemetry",
};

// ============================================================
// 旧用户检测
// ============================================================

/**
 * 解析旧版 openclawcn 配置目录路径。
 */
export function resolveLegacyDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".openclawcn");
}

/**
 * 检测旧版 openclawcn 安装。
 * 只在 configVersion === 0（未初始化新配置）时执行。
 * 发现旧配置则提示运行 cn-migrate --from-legacy。
 */
export function detectLegacyInstall(logger: CnLogger): void {
  const legacyDir = resolveLegacyDir();

  // 检查是否已迁移过
  const migratedMarker = join(legacyDir, ".migrated-to-openclaw");
  if (existsSync(migratedMarker)) return;

  // 检测 ~/.openclawcn/ 目录
  if (existsSync(legacyDir)) {
    const legacyConfig = join(legacyDir, "config.json");
    if (existsSync(legacyConfig)) {
      logger.info(
        "检测到旧版 openclawcn 配置 (~/.openclawcn/)，" +
          "运行 openclaw cn-migrate --from-legacy --dry-run 预览迁移内容",
      );
      return;
    }
  }

  // 检测旧环境变量
  const legacyEnvVars = Object.keys(process.env).filter(
    (k) => k.startsWith("OPENCLAWCN_") || k.startsWith("CLAWDBOT_"),
  );
  if (legacyEnvVars.length > 0) {
    logger.info(
      `检测到旧版环境变量 (${legacyEnvVars.join(", ")})，` + "建议更新为 OPENCLAW_* 前缀",
    );
  }
}

// ============================================================
// 旧配置迁移逻辑
// ============================================================

/**
 * 读取旧版配置并转换为新版格式。
 */
export function convertLegacyConfig(
  legacyConfig: Record<string, unknown>,
): Record<string, unknown> {
  const newConfig: Record<string, unknown> = {};

  for (const [oldKey, newPath] of Object.entries(LEGACY_FIELD_MAP)) {
    const value = getNestedValue(legacyConfig, oldKey);
    if (value !== undefined) {
      setNestedValue(newConfig, newPath, value);
    }
  }

  return newConfig;
}

/**
 * 执行旧版 → 新版迁移。
 * 返回迁移的文件列表。
 */
export function migrateFromLegacy(opts: {
  dryRun: boolean;
  legacyDir?: string;
  targetConfigPath?: string;
}): { actions: string[]; errors: string[] } {
  const legacyDir = opts.legacyDir ?? resolveLegacyDir();
  const targetConfigPath = opts.targetConfigPath ?? resolveDefaultConfigPath();
  const actions: string[] = [];
  const errors: string[] = [];

  // 1. 迁移配置文件
  const legacyConfigPath = join(legacyDir, "config.json");
  if (existsSync(legacyConfigPath)) {
    try {
      const legacyContent = readFileSync(legacyConfigPath, "utf-8");
      const legacyConfig = JSON.parse(legacyContent) as Record<string, unknown>;
      const converted = convertLegacyConfig(legacyConfig);

      // 合并到现有新配置（如果存在）
      let targetConfig: Record<string, unknown> = {};
      if (existsSync(targetConfigPath)) {
        try {
          targetConfig = JSON.parse(readFileSync(targetConfigPath, "utf-8"));
        } catch {
          // 新配置损坏，用空配置
        }
      }

      // 用 fill-empty 策略：不覆盖已有值
      const merged = mergeWithFillEmpty(targetConfig, converted);

      // 应用最新版本迁移
      const migrated = migrateConfig(merged);
      // 分离 cnPlugin.* → state 文件，其余 → openclaw.json
      const { upstreamConfig, configVersion } = separateCnPluginFromConfig(migrated.config);

      actions.push(`配置: ${legacyConfigPath} → ${targetConfigPath}`);
      for (const [oldKey, newPath] of Object.entries(LEGACY_FIELD_MAP)) {
        const val = getNestedValue(legacyConfig, oldKey);
        if (val !== undefined) {
          actions.push(`  字段映射: ${oldKey} → ${newPath} = ${JSON.stringify(val)}`);
        }
      }

      if (!opts.dryRun) {
        mkdirSync(dirname(targetConfigPath), { recursive: true });
        writeFileSync(targetConfigPath, JSON.stringify(upstreamConfig, null, 2), "utf-8");
        // configVersion 写入 cn-adapter-state.json
        setConfigVersionInState(configVersion);
      }
    } catch (err) {
      errors.push(`读取旧配置失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. 写入迁移标记（只在有实际迁移操作时）
  if (!opts.dryRun && errors.length === 0 && actions.length > 0) {
    try {
      const marker = join(legacyDir, ".migrated-to-openclaw");
      writeFileSync(marker, new Date().toISOString(), "utf-8");
      actions.push(`标记: ${marker}`);
    } catch {
      // 非关键，忽略
    }
  }

  return { actions, errors };
}

// ============================================================
// CLI 注册
// ============================================================

export function registerCnMigrate(program: Command): void {
  const cmd = program
    .command("cn-migrate")
    .description("OpenClawCN 配置迁移工具")
    .option("--auto", "自动模式：直接执行迁移，不需要确认")
    .option("--dry-run", "只预览变更，不执行")
    .option("--rollback", "从最近的备份恢复配置")
    .option("--from-legacy", "从旧版 ~/.openclawcn/ 迁移到新版 ~/.openclaw/")
    .option("--config-path <path>", "指定配置文件路径")
    .action(async (opts) => {
      const configPath = opts.configPath || resolveDefaultConfigPath();

      // --from-legacy mode
      if (opts.fromLegacy) {
        return handleFromLegacy(opts);
      }

      // --rollback mode
      if (opts.rollback) {
        return handleRollback(configPath);
      }

      // Normal migration mode
      return handleNormalMigration(configPath, opts);
    });
}

// ============================================================
// Command handlers
// ============================================================

function handleFromLegacy(opts: { dryRun?: boolean; configPath?: string }): void {
  const legacyDir = resolveLegacyDir();

  if (!existsSync(legacyDir)) {
    log.info("未检测到旧版 openclawcn 目录 (~/.openclawcn/)，无需迁移");
    return;
  }

  const legacyConfig = join(legacyDir, "config.json");
  if (!existsSync(legacyConfig)) {
    log.info("旧版目录存在但没有 config.json，无需迁移");
    return;
  }

  // 检查是否已迁移
  const marker = join(legacyDir, ".migrated-to-openclaw");
  if (existsSync(marker)) {
    log.info("已经执行过迁移（发现 .migrated-to-openclaw 标记），无需重复");
    return;
  }

  console.log("\n=== 旧版 openclawcn → 新版 openclaw 迁移 ===\n");

  const result = migrateFromLegacy({
    dryRun: opts.dryRun ?? true, // 默认 dry-run
    legacyDir,
    targetConfigPath: opts.configPath ?? resolveDefaultConfigPath(),
  });

  if (result.actions.length === 0) {
    console.log("没有需要迁移的内容");
    return;
  }

  console.log("迁移操作:");
  for (const action of result.actions) {
    console.log(`  ${action}`);
  }

  if (result.errors.length > 0) {
    console.log("\n错误:");
    for (const err of result.errors) {
      console.log(`  ❌ ${err}`);
    }
  }

  if (opts.dryRun || opts.dryRun === undefined) {
    console.log("\n(--dry-run 模式，未执行任何变更)");
    console.log("确认无误后运行: openclaw cn-migrate --from-legacy --auto");
  } else {
    log.info("旧版迁移完成");
  }
}

function handleRollback(configPath: string): void {
  const configDir = dirname(configPath);
  const backupDir = join(configDir, ".config-backups");
  if (!existsSync(backupDir)) {
    log.error("没有找到备份目录");
    return;
  }
  const backups = readdirSync(backupDir)
    .filter((f) => f.startsWith("config-") && f.endsWith(".json5"))
    .sort()
    .reverse();
  if (backups.length === 0) {
    log.error("没有可用的备份");
    return;
  }
  const latestBackup = join(backupDir, backups[0]);
  // 先验证备份文件内容有效再恢复
  try {
    const backupContent = readFileSync(latestBackup, "utf-8");
    JSON.parse(backupContent);
  } catch {
    log.error(`备份文件损坏或不是有效 JSON: ${backups[0]}`);
    return;
  }
  restoreBackup(latestBackup, configPath);
  log.info(`已从备份恢复: ${backups[0]}`);
}

function handleNormalMigration(
  configPath: string,
  opts: { dryRun?: boolean; auto?: boolean },
): void {
  let currentConfig: Record<string, unknown>;
  try {
    const content = readFileSync(configPath, "utf-8");
    currentConfig = JSON.parse(content);
  } catch {
    log.info("配置文件不存在或格式错误，使用空配置");
    currentConfig = {};
  }

  // 如果老用户有 cnPlugin，先迁移到 state 文件并清除
  if (currentConfig.cnPlugin) {
    currentConfig = migrateCnPluginToState(currentConfig);
    log.info("老用户 cnPlugin 已迁移到 cn-adapter-state.json");
  }

  const currentVersion = getCurrentConfigVersion(currentConfig);
  const latestVersion = Math.max(0, ...MIGRATIONS.map((m) => m.version));

  if (currentVersion >= latestVersion) {
    log.info(`配置已是最新版本 (v${currentVersion})，无需迁移`);
    return;
  }

  const result = migrateConfig(currentConfig);

  // Print changes
  console.log(`\n当前版本: v${currentVersion} → 目标版本: v${latestVersion}`);
  console.log(`将应用 ${result.applied.length} 个迁移步骤:`);
  for (const v of result.applied) {
    const step = MIGRATIONS.find((m) => m.version === v);
    console.log(`  v${v}: ${step?.label ?? "unknown"}`);
    for (const change of step?.changes ?? []) {
      console.log(`    - ${change.path} = ${JSON.stringify(change.value)} [${change.strategy}]`);
    }
  }

  if (opts.dryRun) {
    console.log("\n(--dry-run 模式，未执行任何变更)");
    return;
  }

  if (!opts.auto) {
    console.log("\n使用 --auto 参数自动执行迁移");
    return;
  }

  // Execute migration — 分离 cnPlugin.* 和上游配置
  if (existsSync(configPath)) {
    const backupPath = createBackup(configPath);
    log.info(`备份已创建: ${backupPath}`);
  }
  const { upstreamConfig, configVersion: newVersion } = separateCnPluginFromConfig(result.config);
  writeFileSync(configPath, JSON.stringify(upstreamConfig, null, 2));
  setConfigVersionInState(newVersion);
  log.info(`迁移完成: v${currentVersion} → v${latestVersion}`);
}

// ============================================================
// Internal helpers
// ============================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function mergeWithFillEmpty(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (result[key] === undefined) {
      result[key] = value;
    } else if (
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key]) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = mergeWithFillEmpty(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    }
    // 已有值则保留（fill-empty 策略）
  }
  return result;
}
