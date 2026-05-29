import { describe, it, expect } from "vitest";
import type { CnPluginConfig } from "../cn-config.js";
import { shouldBypassProxy, createProxyRouterHandler, DEFAULT_NO_PROXY } from "../proxy-router.js";

describe("shouldBypassProxy", () => {
  it("matches wildcard pattern *.baidu.com against api.baidu.com", () => {
    expect(shouldBypassProxy("api.baidu.com", ["*.baidu.com"])).toBe(true);
  });

  it("matches wildcard pattern *.baidu.com against www.baidu.com", () => {
    expect(shouldBypassProxy("www.baidu.com", ["*.baidu.com"])).toBe(true);
  });

  it("matches wildcard *.baidu.com against bare baidu.com", () => {
    expect(shouldBypassProxy("baidu.com", ["*.baidu.com"])).toBe(true);
  });

  it("does not match github.com against CN noProxy list", () => {
    expect(shouldBypassProxy("github.com", DEFAULT_NO_PROXY)).toBe(false);
  });

  it("does not match api.openai.com against CN noProxy list", () => {
    expect(shouldBypassProxy("api.openai.com", DEFAULT_NO_PROXY)).toBe(false);
  });

  it("matches exact domain", () => {
    expect(shouldBypassProxy("example.com", ["example.com"])).toBe(true);
  });

  it("does not match subdomain against exact domain", () => {
    expect(shouldBypassProxy("sub.example.com", ["example.com"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(shouldBypassProxy("API.Baidu.COM", ["*.baidu.com"])).toBe(true);
  });

  it("returns false for empty noProxy list", () => {
    expect(shouldBypassProxy("anything.com", [])).toBe(false);
  });

  it("matches all default CN domains", () => {
    const cnDomains = [
      "api.baidu.com",
      "oss.aliyuncs.com",
      "vpc.tencentcloudapi.com",
      "open.volcengineapi.com",
      "open.zhipuai.cn",
      "api.moonshot.cn",
      "api.siliconflow.cn",
      "gitee.com",
      "cdn.npmmirror.com",
    ];
    for (const domain of cnDomains) {
      expect(shouldBypassProxy(domain, DEFAULT_NO_PROXY)).toBe(true);
    }
  });
});

describe("createProxyRouterHandler", () => {
  it("returns undefined when proxy is not enabled", () => {
    const handler = createProxyRouterHandler(() => ({
      proxy: { enabled: false },
    }));
    expect(handler("api.baidu.com")).toBeUndefined();
  });

  it("returns undefined when proxy config is missing", () => {
    const handler = createProxyRouterHandler(() => ({}));
    expect(handler("api.baidu.com")).toBeUndefined();
  });

  it("returns true for CN domain when proxy is enabled", () => {
    const handler = createProxyRouterHandler(() => ({
      proxy: { enabled: true },
    }));
    expect(handler("api.baidu.com")).toBe(true);
  });

  it("returns false for non-CN domain when proxy is enabled", () => {
    const handler = createProxyRouterHandler(() => ({
      proxy: { enabled: true },
    }));
    expect(handler("api.openai.com")).toBe(false);
  });

  it("merges user noProxy with defaults", () => {
    const handler = createProxyRouterHandler(() => ({
      proxy: { enabled: true, noProxy: ["*.custom-internal.cn"] },
    }));
    // Custom domain should bypass
    expect(handler("api.custom-internal.cn")).toBe(true);
    // Default CN domain should still bypass
    expect(handler("api.baidu.com")).toBe(true);
    // Non-matching domain should not bypass
    expect(handler("github.com")).toBe(false);
  });
});
