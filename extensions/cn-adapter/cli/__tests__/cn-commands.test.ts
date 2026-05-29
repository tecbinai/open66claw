import { Command } from "commander";
import { describe, it, expect } from "vitest";
import { registerCnCommands } from "../cn-commands.js";

describe("registerCnCommands", () => {
  it("registers without throwing", () => {
    const program = new Command();
    expect(() => registerCnCommands(program)).not.toThrow();
  });

  it("registers 帮助 command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "帮助");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("显示帮助信息");
  });

  it("registers 状态 command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "状态");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("显示当前状态");
  });

  it("registers 配置 command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "配置");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("显示或修改配置");
  });

  it("registers 升级 command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "升级");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("自动升级 CN 配置");
  });

  it("registers all 4 Chinese commands", () => {
    const program = new Command();
    registerCnCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("帮助");
    expect(names).toContain("状态");
    expect(names).toContain("配置");
    expect(names).toContain("升级");
    expect(program.commands.length).toBe(4);
  });
});
