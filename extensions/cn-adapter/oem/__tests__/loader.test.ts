import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadBrand, resolveCustomBrandsDir } from "../loader.js";
import { validateBrandConfig } from "../types.js";

describe("validateBrandConfig", () => {
  it("accepts valid brand config", () => {
    expect(
      validateBrandConfig({
        id: "test",
        name: "Test",
        displayName: "Test Brand",
        version: "1.0.0",
      }),
    ).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(validateBrandConfig(null)).toBe(false);
    expect(validateBrandConfig(undefined)).toBe(false);
  });

  it("rejects missing id", () => {
    expect(validateBrandConfig({ name: "Test", displayName: "T", version: "1.0.0" })).toBe(false);
  });

  it("rejects empty id", () => {
    expect(validateBrandConfig({ id: "", name: "Test", displayName: "T", version: "1.0.0" })).toBe(
      false,
    );
  });

  it("rejects non-string id", () => {
    expect(validateBrandConfig({ id: 123, name: "Test", displayName: "T", version: "1.0.0" })).toBe(
      false,
    );
  });

  it("rejects missing name", () => {
    expect(validateBrandConfig({ id: "test", displayName: "T", version: "1.0.0" })).toBe(false);
  });

  it("rejects non-object identity", () => {
    expect(
      validateBrandConfig({
        id: "test",
        name: "Test",
        displayName: "T",
        version: "1.0.0",
        identity: "bad",
      }),
    ).toBe(false);
  });

  it("accepts config without optional fields", () => {
    expect(
      validateBrandConfig({
        id: "test",
        name: "Test",
        displayName: "Test",
        version: "1.0.0",
        description: "desc",
      }),
    ).toBe(true);
  });
});

describe("resolveCustomBrandsDir", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("uses OPENCLAW_OEM_DIR env if set", () => {
    process.env.OPENCLAW_OEM_DIR = "/custom/oem";
    expect(resolveCustomBrandsDir()).toBe("/custom/oem");
  });

  it("falls back to ~/.openclawcn/oem", () => {
    delete process.env.OPENCLAW_OEM_DIR;
    const dir = resolveCustomBrandsDir();
    expect(dir).toContain("oem");
    expect(dir).toContain(".openclawcn");
  });
});

describe("loadBrand", () => {
  it("loads built-in default brand", () => {
    const result = loadBrand("default");
    expect(result.source).toBe("builtin");
    expect(result.brand.id).toBe("openclawcn");
    expect(result.brand.name).toBe("OpenClawCN");
    expect(result.brand.displayName).toBe("OpenClaw 中国版");
    expect(result.brand.version).toBe("0.1.0");
  });

  it("returns complete identity with defaults", () => {
    const result = loadBrand("default");
    expect(result.brand.identity).toBeDefined();
    expect(result.brand.identity.oemId).toBe("openclawcn");
    expect(typeof result.brand.identity.apiBaseUrl).toBe("string");
  });

  it("returns defaults section", () => {
    const result = loadBrand("default");
    expect(result.brand.defaults).toBeDefined();
    expect(result.brand.defaults.locale).toBe("zh-CN");
    expect(result.brand.defaults.mirror).toBeDefined();
  });

  it("returns ui section", () => {
    const result = loadBrand("default");
    expect(result.brand.ui).toBeDefined();
    expect(result.brand.ui.primaryColor).toBe("#1677ff");
  });

  it("falls back to default when brand not found", () => {
    const result = loadBrand("nonexistent-brand-xyz");
    expect(result.source).toBe("builtin");
    expect(result.brand.id).toBe("openclawcn");
  });

  it("throws on invalid brand ID characters", () => {
    expect(() => loadBrand("../../../etc/passwd")).toThrow("Invalid brand ID");
    expect(() => loadBrand("brand with spaces")).toThrow("Invalid brand ID");
    expect(() => loadBrand("brand;rm -rf")).toThrow("Invalid brand ID");
  });

  it("accepts valid brand ID characters", () => {
    // These won't find files but should not throw on validation
    const result = loadBrand("my-brand_v2");
    expect(result.brand.id).toBe("openclawcn"); // falls back to default
  });
});
