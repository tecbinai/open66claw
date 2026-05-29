import { describe, it, expect } from "vitest";
import { createSecurityTierHandler } from "../security-tier.js";

describe("createSecurityTierHandler", () => {
  // ─── full 档：不拦截任何工具（3 个 case）───

  it("full tier: does not block bash", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "full" }));
    const result = await handler({ toolName: "bash", params: {} });
    expect(result).toBeUndefined();
  });

  it("full tier: does not block exec", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "full" }));
    const result = await handler({ toolName: "exec", params: {} });
    expect(result).toBeUndefined();
  });

  it("full tier: does not block write", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "full" }));
    const result = await handler({ toolName: "write", params: {} });
    expect(result).toBeUndefined();
  });

  // ─── balanced 档：拦截 exec 类工具、不拦截普通工具（4 个 case）───

  it("balanced tier: blocks exec with confirmation prompt", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    const result = await handler({ toolName: "exec", params: {} });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("exec"),
    });
    expect(result!.blockReason).toContain("危险工具");
  });

  it("balanced tier: blocks shell with confirmation prompt", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    const result = await handler({ toolName: "shell", params: {} });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("shell"),
    });
  });

  it("balanced tier: allows read_file", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    const result = await handler({ toolName: "read_file", params: {} });
    expect(result).toBeUndefined();
  });

  it("balanced tier: blocks path outside project directory", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    const result = await handler({
      toolName: "read_file",
      params: { path: "/etc/passwd" },
    });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("不在项目目录内"),
    });
  });

  it("balanced tier: blocks path with similar prefix (project-evil)", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    // 构造一个和 cwd 同前缀但不同目录的路径
    const evilPath = process.cwd() + "-evil/secret.txt";
    const result = await handler({
      toolName: "read_file",
      params: { path: evilPath },
    });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("不在项目目录内"),
    });
  });

  it("balanced tier: allows path within project directory", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "balanced" }));
    const { join } = require("node:path");
    const safePath = join(process.cwd(), "src", "index.ts");
    const result = await handler({
      toolName: "read_file",
      params: { path: safePath },
    });
    expect(result).toBeUndefined();
  });

  // ─── safe 档：只放行白名单工具、拦截其他（4 个 case）───

  it("safe tier: allows all whitelist tools", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "safe" }));
    for (const tool of [
      "read_file",
      "list_files",
      "search",
      "web_search",
      "memory_get",
      "memory_search",
    ]) {
      const result = await handler({ toolName: tool, params: {} });
      expect(result).toBeUndefined();
    }
  });

  it("safe tier: blocks write tool", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "safe" }));
    const result = await handler({ toolName: "write", params: {} });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("不在白名单中"),
    });
  });

  it("safe tier: completely blocks bash", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "safe" }));
    const result = await handler({ toolName: "bash", params: {} });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("被完全禁用"),
    });
  });

  it("safe tier: completely blocks exec", async () => {
    const handler = createSecurityTierHandler(() => ({ securityTier: "safe" }));
    const result = await handler({ toolName: "exec", params: {} });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("被完全禁用"),
    });
  });

  // ─── 默认档位：无配置时默认 full（1 个 case）───

  it("defaults to full when securityTier is undefined", async () => {
    const handler = createSecurityTierHandler(() => ({}));
    const result = await handler({ toolName: "bash", params: {} });
    expect(result).toBeUndefined();
  });
});
