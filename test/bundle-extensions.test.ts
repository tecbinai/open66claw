import { describe, it, expect } from "vitest";
import { discoverExtensions } from "../scripts/bundle-extensions.js";

describe("discoverExtensions", () => {
  it("discovers at least cn-adapter extension", () => {
    const exts = discoverExtensions();
    const names = exts.map((e) => e.name);
    expect(names).toContain("cn-adapter");
  });

  it("each extension has valid entry and outDir", () => {
    const exts = discoverExtensions();
    for (const ext of exts) {
      expect(ext.name).toBeTruthy();
      expect(ext.entry).toContain("index.ts");
      expect(ext.outDir).toContain("dist");
      expect(ext.outDir).toContain(ext.name);
    }
  });

  it("discovers CN channel extensions if present", () => {
    const exts = discoverExtensions();
    const names = exts.map((e) => e.name);
    // These should exist in the project
    const cnExtensions = ["dingtalk", "wecom", "qqbot", "openclawwechat"];
    for (const cn of cnExtensions) {
      if (names.includes(cn)) {
        const ext = exts.find((e) => e.name === cn)!;
        expect(ext.entry).toBeTruthy();
      }
    }
  });

  it("does not discover non-CN extensions", () => {
    const exts = discoverExtensions();
    const names = exts.map((e) => e.name);
    // These are upstream extensions, should not be bundled
    expect(names).not.toContain("telegram");
    expect(names).not.toContain("discord");
    expect(names).not.toContain("slack");
  });
});
