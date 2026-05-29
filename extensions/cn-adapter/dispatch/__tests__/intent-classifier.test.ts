import { describe, it, expect } from "vitest";
import { compileIntents, classifyByRules, classifyIntent } from "../intent-classifier.js";
import type { IntentDefinition } from "../types.js";

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_INTENTS: IntentDefinition[] = [
  {
    id: "coding",
    description: "Code writing and debugging",
    patterns: {
      keywords: ["代码", "编程", "debug", "function", "bug", "编译"],
      regex: ["\\b(def|class|function|import)\\b"],
    },
    skills: ["code_write"],
  },
  {
    id: "image_generation",
    description: "Image creation and editing",
    patterns: {
      keywords: ["画", "图片", "生成图", "draw", "image"],
      regex: ["生成.*图", "画.*张"],
      excludeKeywords: ["计划", "画面描述"],
    },
    skills: ["image_gen"],
  },
  {
    id: "web_browsing",
    description: "Web search and browsing",
    patterns: {
      keywords: ["搜索", "查找", "search", "browse", "网页"],
      regex: ["搜[一索].*下", "查[一找].*下"],
    },
    skills: ["web_search"],
  },
  {
    id: "general",
    description: "General conversation",
    patterns: {
      keywords: [],
      regex: [],
    },
    skills: [],
  },
];

const compiled = compileIntents(TEST_INTENTS);

// ---------------------------------------------------------------------------
// Tests: compileIntents
// ---------------------------------------------------------------------------

describe("compileIntents", () => {
  it("should compile regex patterns into RegExp objects", () => {
    const codingIntent = compiled.find((i) => i.id === "coding")!;
    expect(codingIntent.compiledRegex).toHaveLength(1);
    expect(codingIntent.compiledRegex[0]).toBeInstanceOf(RegExp);
  });

  it("should lowercase keywords", () => {
    const codingIntent = compiled.find((i) => i.id === "coding")!;
    expect(codingIntent.lowerKeywords).toContain("debug");
    expect(codingIntent.lowerKeywords).toContain("代码");
  });

  it("should lowercase exclude keywords", () => {
    const imageIntent = compiled.find((i) => i.id === "image_generation")!;
    expect(imageIntent.lowerExcludeKeywords).toContain("计划");
  });

  it("should handle invalid regex gracefully", () => {
    const intents: IntentDefinition[] = [
      {
        id: "bad",
        description: "bad regex",
        patterns: { keywords: [], regex: ["[invalid"] },
        skills: [],
      },
    ];
    const result = compileIntents(intents);
    expect(result[0]!.compiledRegex).toHaveLength(1);
    // The never-match regex should not match anything
    expect(result[0]!.compiledRegex[0]!.test("anything")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: classifyByRules
// ---------------------------------------------------------------------------

describe("classifyByRules", () => {
  it("should match coding intent by Chinese keyword", () => {
    const results = classifyByRules("帮我写一段代码", compiled);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.intentId).toBe("coding");
    expect(results[0]!.confidence).toBeGreaterThan(0);
  });

  it("should match coding intent by English keyword", () => {
    const results = classifyByRules("I need to debug this function", compiled);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.intentId).toBe("coding");
  });

  it("should match coding intent by regex", () => {
    const results = classifyByRules("def hello():", compiled);
    expect(results.length).toBeGreaterThan(0);
    const coding = results.find((r) => r.intentId === "coding");
    expect(coding).toBeDefined();
    expect(coding!.matchedBy).toMatch(/regex|combined/);
  });

  it("should match web browsing intent", () => {
    const results = classifyByRules("帮我搜索一下 React hooks", compiled);
    expect(results[0]!.intentId).toBe("web_browsing");
  });

  it("should suppress image_generation when excludeKeyword '计划' is present", () => {
    const results = classifyByRules("画一个计划表", compiled);
    const imageResult = results.find((r) => r.intentId === "image_generation");
    // Should be penalized (excluded)
    if (imageResult) {
      expect(imageResult.matchDetails).toContain("excluded");
      expect(imageResult.confidence).toBeLessThan(0.3);
    }
  });

  it("should return catch-all for general intent", () => {
    const results = classifyByRules("你好", compiled);
    const general = results.find((r) => r.intentId === "general");
    expect(general).toBeDefined();
    expect(general!.confidence).toBe(0.1);
    expect(general!.matchDetails).toBe("catch-all");
  });

  it("should return results sorted by confidence descending", () => {
    const results = classifyByRules("搜索 debug 代码 bug", compiled);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.confidence).toBeGreaterThanOrEqual(results[i]!.confidence);
    }
  });

  it("should return empty array for no-match prompt (only catch-all)", () => {
    // "天气" doesn't match coding/image/web but matches general catch-all
    const results = classifyByRules("天气怎么样", compiled);
    // Should only have the catch-all
    const nonGeneral = results.filter((r) => r.intentId !== "general");
    expect(nonGeneral).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: classifyIntent
// ---------------------------------------------------------------------------

describe("classifyIntent", () => {
  it("should return best match above threshold", () => {
    const result = classifyIntent("帮我写一段代码", compiled, 0.3);
    expect(result.intentId).toBe("coding");
    expect(result.classifierUsed).toBe("rules");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("should still return best match even below threshold", () => {
    // With very high threshold, still returns best rule match
    const result = classifyIntent("帮我写一段代码", compiled, 0.99);
    expect(result.intentId).toBe("coding");
    expect(result.classifierUsed).toBe("rules");
  });

  it("should return 'general' default for unmatched prompt", () => {
    // Completely unrelated prompt
    const result = classifyIntent("xyz123", compiled, 0.3);
    // Either general catch-all or default
    expect(["general"]).toContain(result.intentId);
  });

  it("should handle empty intent list", () => {
    const result = classifyIntent("hello", [], 0.3);
    expect(result.intentId).toBe("general");
    expect(result.classifierUsed).toBe("default");
    expect(result.confidence).toBe(0);
  });
});
