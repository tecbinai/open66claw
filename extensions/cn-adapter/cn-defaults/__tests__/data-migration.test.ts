import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runDataMigrations,
  readState,
  writeState,
  CN_DATA_MIGRATIONS,
  getCurrentConfigVersion,
  getConfigVersionFromState,
  getConfigVersionFromLegacyCnPlugin,
  setConfigVersionInState,
  migrateCnPluginToState,
  type CnAdapterState,
} from "../data-migration.js";

// 使用临时目录避免污染用户环境
let testDir: string;
let statePath: string;

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `cn-data-migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  statePath = join(testDir, "cn-adapter-state.json");
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe("readState", () => {
  it("returns null when file does not exist", () => {
    expect(readState(statePath)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    writeFileSync(statePath, "not json", "utf-8");
    expect(readState(statePath)).toBeNull();
  });

  it("reads valid state file", () => {
    const state: CnAdapterState = {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
    };
    writeFileSync(statePath, JSON.stringify(state), "utf-8");
    expect(readState(statePath)).toEqual(state);
  });
});

describe("writeState", () => {
  it("creates state file", () => {
    const state: CnAdapterState = {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
    };
    writeState(statePath, state);
    expect(existsSync(statePath)).toBe(true);
    const written = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(written.dataVersion).toBe(1);
  });

  it("creates parent directory if needed", () => {
    const nestedPath = join(testDir, "sub", "deep", "cn-adapter-state.json");
    const state: CnAdapterState = {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
    };
    writeState(nestedPath, state);
    expect(existsSync(nestedPath)).toBe(true);
  });
});

describe("CN_DATA_MIGRATIONS", () => {
  it("versions are strictly increasing", () => {
    for (let i = 1; i < CN_DATA_MIGRATIONS.length; i++) {
      expect(CN_DATA_MIGRATIONS[i].version).toBeGreaterThan(CN_DATA_MIGRATIONS[i - 1].version);
    }
  });

  it("all steps have description and migrate function", () => {
    for (const step of CN_DATA_MIGRATIONS) {
      expect(step.description).toBeTruthy();
      expect(typeof step.migrate).toBe("function");
    }
  });
});

describe("runDataMigrations", () => {
  it("applies v1 migration on fresh install", async () => {
    const result = await runDataMigrations(statePath);
    expect(result.applied).toContain(1);
    expect(result.skipped).toHaveLength(0);

    // state 文件应该被创建
    const state = readState(statePath);
    expect(state).not.toBeNull();
    expect(state!.dataVersion).toBe(1);
    expect(state!.installedAt).toBeTruthy();
    expect(state!.lastActiveAt).toBeTruthy();
  });

  it("skips already-applied migrations", async () => {
    // 先写入一个已完成 v1 的 state
    const state: CnAdapterState = {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-08T00:00:00.000Z",
    };
    writeState(statePath, state);

    const result = await runDataMigrations(statePath);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toContain(1);

    // installedAt 应保持不变
    const updatedState = readState(statePath);
    expect(updatedState!.installedAt).toBe("2026-03-08T00:00:00.000Z");
  });

  it("preserves installedAt across migrations", async () => {
    const result = await runDataMigrations(statePath);
    expect(result.applied.length).toBeGreaterThan(0);

    const state1 = readState(statePath);
    const firstInstalledAt = state1!.installedAt;

    // 再次运行不应改变 installedAt
    await runDataMigrations(statePath);
    const state2 = readState(statePath);
    expect(state2!.installedAt).toBe(firstInstalledAt);
  });

  it("updates lastActiveAt on every run", async () => {
    await runDataMigrations(statePath);
    const state1 = readState(statePath);

    // 等一小段时间让时间戳变化
    await new Promise((r) => setTimeout(r, 10));

    await runDataMigrations(statePath);
    const state2 = readState(statePath);

    // lastActiveAt 应该更新（或至少不早于之前的值）
    expect(new Date(state2!.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(state1!.lastActiveAt).getTime(),
    );
  });

  it("handles migration failure gracefully (does not throw)", async () => {
    // 用只读目录模拟写入失败（跳过此测试如果在 Windows 上权限不生效）
    // 改为测试：即使 state 文件路径无效也不抛异常
    const invalidPath = join(testDir, "\0invalid", "state.json");
    // 不应抛异常
    const result = await runDataMigrations(invalidPath);
    // 迁移步骤可能失败，但函数本身不抛
    expect(result).toBeDefined();
  });
});

describe("getConfigVersionFromState", () => {
  it("returns 0 when state file does not exist", () => {
    expect(getConfigVersionFromState(statePath)).toBe(0);
  });

  it("returns 0 when state has no configVersion", () => {
    writeState(statePath, {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
    });
    expect(getConfigVersionFromState(statePath)).toBe(0);
  });

  it("returns configVersion from state file", () => {
    writeState(statePath, {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
      configVersion: 7,
    });
    expect(getConfigVersionFromState(statePath)).toBe(7);
  });
});

describe("getConfigVersionFromLegacyCnPlugin", () => {
  it("returns 0 for empty config", () => {
    expect(getConfigVersionFromLegacyCnPlugin({})).toBe(0);
  });

  it("returns 0 if cnPlugin has no configVersion", () => {
    expect(getConfigVersionFromLegacyCnPlugin({ cnPlugin: { locale: "zh-CN" } })).toBe(0);
  });

  it("returns version from cnPlugin.configVersion", () => {
    expect(getConfigVersionFromLegacyCnPlugin({ cnPlugin: { configVersion: 5 } })).toBe(5);
  });
});

describe("getCurrentConfigVersion (unified)", () => {
  it("returns 0 for fresh install (no state file, no cnPlugin)", () => {
    expect(getCurrentConfigVersion({}, statePath)).toBe(0);
  });

  it("prefers state file over cnPlugin", () => {
    writeState(statePath, {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
      configVersion: 9,
    });
    // Even though cnPlugin says 5, state file says 9
    expect(getCurrentConfigVersion({ cnPlugin: { configVersion: 5 } }, statePath)).toBe(9);
  });

  it("falls back to cnPlugin when state file has no configVersion", () => {
    writeState(statePath, {
      dataVersion: 1,
      lastActiveAt: "2026-03-09T00:00:00.000Z",
      installedAt: "2026-03-09T00:00:00.000Z",
    });
    expect(getCurrentConfigVersion({ cnPlugin: { configVersion: 3 } }, statePath)).toBe(3);
  });
});

describe("setConfigVersionInState", () => {
  it("creates state file with configVersion", () => {
    setConfigVersionInState(9, statePath);
    const state = readState(statePath);
    expect(state).not.toBeNull();
    expect(state!.configVersion).toBe(9);
    expect(state!.installedAt).toBeTruthy();
  });

  it("preserves existing state fields", () => {
    writeState(statePath, {
      dataVersion: 1,
      lastActiveAt: "2026-03-01T00:00:00.000Z",
      installedAt: "2026-03-01T00:00:00.000Z",
      cnConfig: { locale: "zh-CN" },
    });
    setConfigVersionInState(9, statePath);
    const state = readState(statePath);
    expect(state!.configVersion).toBe(9);
    expect(state!.dataVersion).toBe(1);
    expect(state!.installedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(state!.cnConfig?.locale).toBe("zh-CN");
  });
});

describe("migrateCnPluginToState", () => {
  it("migrates cnPlugin fields to state file and returns cleaned config", () => {
    const config = {
      cnPlugin: {
        configVersion: 7,
        locale: "zh-CN",
        securityTier: "full",
        mirror: { npm: "https://registry.npmmirror.com" },
        telemetry: false,
        updateChannel: "stable",
      },
      tools: { exec: { host: "gateway" } },
    };

    const cleaned = migrateCnPluginToState(config, statePath);

    // cleaned config should not have cnPlugin
    expect(cleaned.cnPlugin).toBeUndefined();
    // but keeps other fields
    expect((cleaned.tools as any).exec.host).toBe("gateway");

    // state file should have the values
    const state = readState(statePath);
    expect(state!.configVersion).toBe(7);
    expect(state!.cnConfig?.locale).toBe("zh-CN");
    expect(state!.cnConfig?.securityTier).toBe("full");
    expect(state!.cnConfig?.mirror?.npm).toBe("https://registry.npmmirror.com");
    expect(state!.cnConfig?.telemetry).toBe(false);
  });

  it("returns config unchanged when no cnPlugin exists", () => {
    const config = { tools: { exec: { host: "gateway" } } };
    const result = migrateCnPluginToState(config, statePath);
    expect(result).toEqual(config);
  });

  it("does not mutate input config", () => {
    const config = {
      cnPlugin: { configVersion: 5 },
      tools: { exec: {} },
    };
    const copy = JSON.parse(JSON.stringify(config));
    migrateCnPluginToState(config, statePath);
    expect(config).toEqual(copy);
  });
});
