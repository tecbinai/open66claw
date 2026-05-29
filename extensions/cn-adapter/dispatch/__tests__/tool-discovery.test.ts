import { describe, it, expect } from "vitest";
import { discoverTools, extractKeywords } from "../tool-discovery.js";

describe("extractKeywords", () => {
  it("extracts Chinese bigrams/trigrams", () => {
    const kws = extractKeywords("帮我搜索一下文件");
    // "帮我" and "搜索" etc. — some will be filtered by stop words
    expect(kws.length).toBeGreaterThan(0);
    // Should contain "搜索" bigram
    expect(kws.some((k) => k.includes("搜") && k.includes("索"))).toBe(true);
  });

  it("extracts English words >= 4 chars", () => {
    const kws = extractKeywords("I want to search for files");
    expect(kws).toContain("search");
    expect(kws).toContain("files");
    // "want" is a stop word
    expect(kws).not.toContain("want");
  });

  it("filters stop words", () => {
    const kws = extractKeywords("the quick brown fox");
    expect(kws).not.toContain("the");
    expect(kws).toContain("quick");
    expect(kws).toContain("brown");
  });

  it("returns empty for stop-words-only input", () => {
    const kws = extractKeywords("is the and for");
    expect(kws).toEqual([]);
  });

  it("deduplicates keywords", () => {
    const kws = extractKeywords("search search search");
    expect(kws.filter((k) => k === "search").length).toBe(1);
  });
});

describe("discoverTools", () => {
  it("discovers web_search for search-related prompt", () => {
    const result = discoverTools("帮我搜索 TypeScript 文档");
    expect(result.toolHints).toContain("web_search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("discovers wechat_send for WeChat-related prompt", () => {
    const result = discoverTools("发微信给张三");
    expect(result.toolHints).toContain("wechat_send");
  });

  it("discovers image_gen for image-related prompt", () => {
    const result = discoverTools("画一张猫的图片");
    expect(result.toolHints).toContain("image_gen");
  });

  it("discovers bash for command-related prompt", () => {
    const result = discoverTools("执行命令 npm install");
    expect(result.toolHints).toContain("bash");
  });

  it("returns empty for very short/stop-word-only prompt", () => {
    const result = discoverTools("hi");
    expect(result.toolHints).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("completes within 50ms for default tools", () => {
    const result = discoverTools("帮我搜索文件并编辑内容");
    expect(result.latencyMs).toBeLessThan(50);
  });

  it("merges runtime tools with builtins", () => {
    const runtimeTools = [
      { name: "custom_db", description: "数据库查询 database query", tags: ["数据库"] },
    ];
    const result = discoverTools("查询数据库", runtimeTools);
    expect(result.toolHints).toContain("custom_db");
  });

  it("runtime tools override builtins with same name", () => {
    const runtimeTools = [{ name: "web_search", description: "自定义搜索", tags: ["custom"] }];
    const result = discoverTools("搜索东西", runtimeTools);
    // Should still find web_search (overridden version)
    expect(result.toolHints).toContain("web_search");
  });

  it("returns summary string for non-empty results", () => {
    const result = discoverTools("搜索 TypeScript 文档");
    if (result.toolHints.length > 0) {
      expect(result.summary).toContain("推荐工具");
    }
  });

  it("respects topN parameter", () => {
    const result = discoverTools("搜索文件编辑写入创建读取", undefined, 2);
    expect(result.toolHints.length).toBeLessThanOrEqual(2);
  });
});
