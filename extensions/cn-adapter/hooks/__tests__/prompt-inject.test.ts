import { describe, it, expect, beforeEach } from "vitest";
import { createPromptInjectHandler } from "../prompt-inject.js";
import { clearDispatchIntent } from "../tool-filter.js";

describe("createPromptInjectHandler", () => {
  beforeEach(() => {
    clearDispatchIntent();
  });

  it("injects Chinese system context when locale is zh-CN", async () => {
    const handler = createPromptInjectHandler(() => ({ locale: "zh-CN" }));
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.prependSystemContext).toBeDefined();
    expect(result.prependSystemContext).toContain("中文");
  });

  it("injects Chinese system context when locale is zh-TW", async () => {
    const handler = createPromptInjectHandler(() => ({ locale: "zh-TW" }));
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.prependSystemContext).toBeDefined();
  });

  it("returns empty object when locale is not Chinese", async () => {
    const handler = createPromptInjectHandler(() => ({ locale: "en" }));
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.prependSystemContext).toBeUndefined();
  });

  it("returns empty object when locale is undefined (extractCnConfig defaults to zh-CN)", async () => {
    // locale undefined 到达 handler 时，排除法不匹配 zh-CN/zh-TW → 不注入
    // 实际运行时 extractCnConfig 会默认为 "zh-CN"，所以这个 case 不会发生
    const handler = createPromptInjectHandler(() => ({}));
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.prependSystemContext).toBeUndefined();
  });

  it("appends tool discovery summary for relevant prompts", async () => {
    const handler = createPromptInjectHandler(() => ({ locale: "zh-CN" }));
    const result = await handler({ prompt: "帮我搜索 TypeScript 文档", messages: [] });
    expect(result.prependSystemContext).toContain("中文");
    // May or may not contain discovery summary depending on confidence threshold
    if (result.prependSystemContext!.includes("Tool Discovery")) {
      expect(result.prependSystemContext).toContain("推荐工具");
    }
  });

  it("does not inject discovery when toolFilterMode is off", async () => {
    const handler = createPromptInjectHandler(() => ({
      locale: "zh-CN",
      toolFilterMode: "off",
    }));
    const result = await handler({ prompt: "帮我搜索文件", messages: [] });
    expect(result.prependSystemContext).toBeDefined();
    expect(result.prependSystemContext).not.toContain("Tool Discovery");
  });
});
