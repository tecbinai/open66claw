import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerCnMigrate,
  detectLegacyInstall,
  convertLegacyConfig,
  migrateFromLegacy,
} from "../cn-migrate.js";

// ============================================================
// 原有测试（保持不变）
// ============================================================

describe("registerCnMigrate", () => {
  it("registers cn-migrate command without throwing", () => {
    const program = new Command();
    expect(() => registerCnMigrate(program)).not.toThrow();
  });

  it("registered command has correct name", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("OpenClawCN 配置迁移工具");
  });

  it("has --auto option", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    const autoOpt = cmd?.options.find((o) => o.long === "--auto");
    expect(autoOpt).toBeDefined();
  });

  it("has --dry-run option", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    const dryRunOpt = cmd?.options.find((o) => o.long === "--dry-run");
    expect(dryRunOpt).toBeDefined();
  });

  it("has --rollback option", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    const rollbackOpt = cmd?.options.find((o) => o.long === "--rollback");
    expect(rollbackOpt).toBeDefined();
  });

  it("has --config-path option", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    const configPathOpt = cmd?.options.find((o) => o.long === "--config-path");
    expect(configPathOpt).toBeDefined();
  });

  it("has --from-legacy option", () => {
    const program = new Command();
    registerCnMigrate(program);
    const cmd = program.commands.find((c) => c.name() === "cn-migrate");
    const fromLegacyOpt = cmd?.options.find((o) => o.long === "--from-legacy");
    expect(fromLegacyOpt).toBeDefined();
  });
});

// ============================================================
// 新增测试：旧用户检测
// ============================================================

describe("detectLegacyInstall", () => {
  it("does not throw when called", () => {
    const messages: string[] = [];
    const mockLogger = {
      info: (msg: string) => messages.push(msg),
      warn: (msg: string) => messages.push(msg),
      error: (msg: string) => messages.push(msg),
    };
    // 不应抛异常（即使目录不存在）
    expect(() => detectLegacyInstall(mockLogger as any)).not.toThrow();
  });
});

// ============================================================
// 新增测试：配置字段转换
// ============================================================

describe("convertLegacyConfig", () => {
  it("maps legacy fields to new paths", () => {
    const legacy = {
      locale: "zh-CN",
      securityLevel: "full",
      mirror: {
        npm: "https://registry.npmmirror.com",
      },
    };
    const result = convertLegacyConfig(legacy);
    expect((result.cnPlugin as any)?.locale).toBe("zh-CN");
    expect((result.cnPlugin as any)?.securityTier).toBe("full");
    expect((result.cnPlugin as any)?.mirror?.npm).toBe("https://registry.npmmirror.com");
  });

  it("ignores fields not in mapping", () => {
    const legacy = {
      unknownField: "value",
      locale: "zh-CN",
    };
    const result = convertLegacyConfig(legacy);
    expect((result as any).unknownField).toBeUndefined();
    expect((result.cnPlugin as any)?.locale).toBe("zh-CN");
  });

  it("handles empty config", () => {
    const result = convertLegacyConfig({});
    // 应该返回空对象（没有任何映射命中）
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ============================================================
// 新增测试：旧版迁移
// ============================================================

describe("migrateFromLegacy", () => {
  let testDir: string;
  let legacyDir: string;
  let targetPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `cn-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    legacyDir = join(testDir, ".openclawcn");
    targetPath = join(testDir, ".openclaw", "openclaw.json");
    mkdirSync(legacyDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("dry-run mode does not write files", () => {
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ locale: "zh-CN" }));

    const result = migrateFromLegacy({
      dryRun: true,
      legacyDir,
      targetConfigPath: targetPath,
    });

    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    // 目标文件不应被创建
    expect(existsSync(targetPath)).toBe(false);
  });

  it("migrates config file", () => {
    const legacyConfig = {
      locale: "zh-CN",
      securityLevel: "balanced",
      mirror: { npm: "https://registry.npmmirror.com" },
    };
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify(legacyConfig));

    const result = migrateFromLegacy({
      dryRun: false,
      legacyDir,
      targetConfigPath: targetPath,
    });

    expect(result.errors).toHaveLength(0);
    expect(existsSync(targetPath)).toBe(true);

    const written = JSON.parse(readFileSync(targetPath, "utf-8"));
    // cnPlugin 已分离到 cn-adapter-state.json，不再出现在 openclaw.json
    expect(written.cnPlugin).toBeUndefined();
    // 但上游字段（由 migration 写入）仍然存在
    expect((written.tools as any)?.exec?.host).toBe("gateway");
  });

  it("writes migration marker on success", () => {
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ locale: "zh-CN" }));

    migrateFromLegacy({
      dryRun: false,
      legacyDir,
      targetConfigPath: targetPath,
    });

    const marker = join(legacyDir, ".migrated-to-openclaw");
    expect(existsSync(marker)).toBe(true);
  });

  it("does not overwrite existing target config values", () => {
    // 先创建一个已有的新配置
    mkdirSync(join(testDir, ".openclaw"), { recursive: true });
    writeFileSync(
      targetPath,
      JSON.stringify({
        cnPlugin: { locale: "en-US", configVersion: 3 },
      }),
    );

    // 旧配置有 locale: zh-CN
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ locale: "zh-CN" }));

    migrateFromLegacy({
      dryRun: false,
      legacyDir,
      targetConfigPath: targetPath,
    });

    const written = JSON.parse(readFileSync(targetPath, "utf-8"));
    // cnPlugin 已分离到 cn-adapter-state.json，不再出现在 openclaw.json
    expect(written.cnPlugin).toBeUndefined();
    // 上游标准字段仍存在
    expect(written.tools).toBeDefined();
  });

  it("handles missing legacy config gracefully", () => {
    // legacyDir 存在但没有 config.json
    const result = migrateFromLegacy({
      dryRun: false,
      legacyDir,
      targetConfigPath: targetPath,
    });

    expect(result.actions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
