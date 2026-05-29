import { Command } from "commander";
import { describe, it, expect } from "vitest";
import { registerCnSetup } from "../cn-setup.js";

describe("registerCnSetup", () => {
  it("registers cn-setup command without throwing", () => {
    const program = new Command();
    expect(() => registerCnSetup(program)).not.toThrow();
  });

  it("registered command has correct name", () => {
    const program = new Command();
    registerCnSetup(program);
    const cmd = program.commands.find((c) => c.name() === "cn-setup");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("OpenClawCN 首次配置向导");
  });

  it("has --config-path option", () => {
    const program = new Command();
    registerCnSetup(program);
    const cmd = program.commands.find((c) => c.name() === "cn-setup");
    const opt = cmd?.options.find((o) => o.long === "--config-path");
    expect(opt).toBeDefined();
  });

  it("has --provider option", () => {
    const program = new Command();
    registerCnSetup(program);
    const cmd = program.commands.find((c) => c.name() === "cn-setup");
    const opt = cmd?.options.find((o) => o.long === "--provider");
    expect(opt).toBeDefined();
  });

  it("has --security option with default value", () => {
    const program = new Command();
    registerCnSetup(program);
    const cmd = program.commands.find((c) => c.name() === "cn-setup");
    const opt = cmd?.options.find((o) => o.long === "--security");
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe("full");
  });
});
