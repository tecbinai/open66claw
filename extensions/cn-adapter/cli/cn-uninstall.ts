import { readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Command } from "commander";
import { createCnLogger, resolveDefaultConfigPath } from "../utils/index.js";
import { resolveStatePath } from "../cn-defaults/data-migration.js";

const log = createCnLogger("uninstall");

export function registerCnUninstall(program: Command): void {
  program
    .command("cn-uninstall")
    .description("卸载 CN 适配器，清理配置和数据")
    .option("--keep-data", "保留备份数据（.config-backups/）")
    .option("--dry-run", "只预览要清理的内容，不执行")
    .option("--config-path <path>", "指定配置文件路径")
    .action(async (opts) => {
      const configPath = opts.configPath || resolveDefaultConfigPath();
      const dryRun = !!opts.dryRun;

      if (dryRun) {
        log.info("=== dry-run 模式：以下操作不会实际执行 ===");
      }

      // 1. 一次性读取配置 → 修改 → 写回（原子操作）
      cleanConfigFile(configPath, dryRun);

      // 2. 删除 cn-adapter-state.json
      removeStateFile(dryRun);

      // 3. 删除 .config-backups/ 目录
      if (!opts.keepData) {
        removeBackupDir(configPath, dryRun);
      } else {
        log.info("--keep-data: 跳过 .config-backups/ 清理");
      }

      if (dryRun) {
        log.info("=== dry-run 完成，未执行任何变更 ===");
      } else {
        log.info("CN 适配器卸载完成");
      }
    });
}

/**
 * 一次读取配置文件，清理所有 CN 相关字段，一次写回。
 */
function cleanConfigFile(configPath: string, dryRun: boolean): void {
  if (!existsSync(configPath)) {
    log.info("配置文件不存在，跳过配置清理");
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    log.warn("配置文件解析失败，跳过配置清理");
    return;
  }

  let changed = false;

  // 清理 cnPlugin 字段
  if (config.cnPlugin !== undefined) {
    log.info("清理 cnPlugin 配置字段");
    delete config.cnPlugin;
    changed = true;
  } else {
    log.info("cnPlugin 字段不存在，无需清理");
  }

  // 清除 plugins.entries.cn-adapter
  const plugins = config.plugins as Record<string, unknown> | undefined;
  const entries = plugins?.entries as Record<string, unknown> | undefined;
  if (entries?.["cn-adapter"]) {
    log.info("清除 cn-adapter 插件状态");
    delete entries["cn-adapter"];
    changed = true;
  } else {
    log.info("cn-adapter 插件条目不存在，无需清理");
  }

  // 一次性写回
  if (changed && !dryRun) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
}

function removeStateFile(dryRun: boolean): void {
  const statePath = resolveStatePath();
  if (existsSync(statePath)) {
    log.info(`删除 cn-adapter state 文件: ${statePath}`);
    if (!dryRun) {
      unlinkSync(statePath);
    }
  } else {
    log.info("cn-adapter state 文件不存在，无需清理");
  }
}

function removeBackupDir(configPath: string, dryRun: boolean): void {
  const configDir = dirname(configPath);
  const backupDir = join(configDir, ".config-backups");

  if (existsSync(backupDir)) {
    log.info(`删除备份目录: ${backupDir}`);
    if (!dryRun) {
      rmSync(backupDir, { recursive: true, force: true });
    }
  } else {
    log.info("备份目录不存在，无需清理");
  }
}
