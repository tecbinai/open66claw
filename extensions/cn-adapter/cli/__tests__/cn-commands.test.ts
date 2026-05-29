import { Command } from "commander";
import { describe, it, expect } from "vitest";
import { registerCnCommands } from "../cn-commands.js";

describe("registerCnCommands", () => {
  it("registers without throwing", () => {
    const program = new Command();
    expect(() => registerCnCommands(program)).not.toThrow();
  });

  it("registers cn-help command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "cn-help");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("Show CN adapter help");
  });

  it("registers cn-status command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "cn-status");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("Show current status");
  });

  it("registers cn-config command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "cn-config");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("Show or edit configuration");
  });

  it("registers cn-upgrade command", () => {
    const program = new Command();
    registerCnCommands(program);
    const cmd = program.commands.find((c) => c.name() === "cn-upgrade");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe("Upgrade CN adapter configuration");
  });

  it("registers all 4 CN commands", () => {
    const program = new Command();
    registerCnCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("cn-help");
    expect(names).toContain("cn-status");
    expect(names).toContain("cn-config");
    expect(names).toContain("cn-upgrade");
    expect(program.commands.length).toBe(4);
  });
});
