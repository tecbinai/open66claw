import { Command } from "commander";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCnUninstall } from "../cn-uninstall.js";

// Mock fs operations
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock resolveStatePath to return a predictable path
vi.mock("../../cn-defaults/data-migration.js", () => ({
  resolveStatePath: vi.fn(() => "/tmp/cn-adapter-state.json"),
}));

import { existsSync, readFileSync, writeFileSync, rmSync, unlinkSync } from "node:fs";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRmSync = vi.mocked(rmSync);
const mockUnlinkSync = vi.mocked(unlinkSync);

function getSubcommand(program: Command): Command {
  return program.commands.find((c) => c.name() === "cn-uninstall")!;
}

describe("registerCnUninstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers without throwing", () => {
    const program = new Command();
    expect(() => registerCnUninstall(program)).not.toThrow();
  });

  it("registers cn-uninstall command", () => {
    const program = new Command();
    registerCnUninstall(program);
    const cmd = getSubcommand(program);
    expect(cmd).toBeDefined();
    expect(cmd.description()).toBe("卸载 CN 适配器，清理配置和数据");
  });

  it("has --keep-data, --dry-run options", () => {
    const program = new Command();
    registerCnUninstall(program);
    const cmd = getSubcommand(program);
    const optNames = cmd.options.map((o) => o.long);
    expect(optNames).toContain("--keep-data");
    expect(optNames).toContain("--dry-run");
    expect(optNames).toContain("--config-path");
  });

  it("--dry-run does not write or delete anything", async () => {
    const config = {
      cnPlugin: { configVersion: 3, locale: "zh-CN" },
      plugins: { entries: { "cn-adapter": { config: {} } } },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(config));

    const program = new Command();
    registerCnUninstall(program);
    const cmd = getSubcommand(program);
    await cmd.parseAsync(["--dry-run", "--config-path", "/tmp/test.json"], { from: "user" });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it("--keep-data skips backup directory removal", async () => {
    const config = {
      cnPlugin: { configVersion: 3 },
      plugins: { entries: { "cn-adapter": { config: {} } } },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(config));

    const program = new Command();
    registerCnUninstall(program);
    const cmd = getSubcommand(program);
    await cmd.parseAsync(["--keep-data", "--config-path", "/tmp/test.json"], { from: "user" });

    // rmSync should NOT be called (backup dir preserved)
    expect(mockRmSync).not.toHaveBeenCalled();
    // writeFileSync should be called once (atomic write)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it("removes cnPlugin and cn-adapter entry in single atomic write", async () => {
    const config = {
      cnPlugin: { configVersion: 3, locale: "zh-CN" },
      plugins: { entries: { "cn-adapter": { config: {} } } },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(config));

    const program = new Command();
    registerCnUninstall(program);
    const cmd = getSubcommand(program);
    await cmd.parseAsync(["--config-path", "/tmp/test.json"], { from: "user" });

    // Single atomic write with both cnPlugin and cn-adapter entry removed
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.cnPlugin).toBeUndefined();
    expect(written.plugins.entries["cn-adapter"]).toBeUndefined();
  });

});
