import { describe, it, expect } from "vitest";
import { createSearchFallbackHandler } from "../search-fallback.js";

describe("createSearchFallbackHandler", () => {
  it("does not intercept non-web_search tools", async () => {
    const handler = createSearchFallbackHandler(() => ({}));
    const result = await handler({ toolName: "bash", params: {} });
    expect(result).toBeUndefined();
  });

  it("does not block when searchApiKey is configured", async () => {
    const handler = createSearchFallbackHandler(() => ({ searchApiKey: "sk-test-123" }));
    const result = await handler({ toolName: "web_search", params: { query: "test" } });
    expect(result).toBeUndefined();
  });

  it("blocks web_search when no searchApiKey", async () => {
    const handler = createSearchFallbackHandler(() => ({}));
    const result = await handler({ toolName: "web_search", params: { query: "hello world" } });
    expect(result).toEqual({
      block: true,
      blockReason: expect.stringContaining("未配置搜索 API key"),
    });
  });

  it("includes bing and baidu URLs in blockReason", async () => {
    const handler = createSearchFallbackHandler(() => ({}));
    const result = await handler({ toolName: "web_search", params: { query: "test query" } });
    expect(result?.blockReason).toContain("https://www.bing.com/search?q=test%20query");
    expect(result?.blockReason).toContain("https://www.baidu.com/s?wd=test%20query");
  });

  it("handles missing query param gracefully", async () => {
    const handler = createSearchFallbackHandler(() => ({}));
    const result = await handler({ toolName: "web_search", params: {} });
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toContain("https://www.bing.com/search?q=");
  });

  it("blocks when searchApiKey is explicitly undefined", async () => {
    const handler = createSearchFallbackHandler(() => ({ searchApiKey: undefined }));
    const result = await handler({ toolName: "web_search", params: { query: "test" } });
    expect(result?.block).toBe(true);
  });
});
