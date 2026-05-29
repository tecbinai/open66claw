import { describe, it, expect } from "vitest";
import {
  transformCompletionRequest,
  transformChatRequest,
  transformCompletionResponse,
  transformChatResponse,
  transformChatStreamChunk,
  parseSseData,
  formatSseData,
  formatSseDone,
} from "../transform.js";

describe("transformCompletionRequest", () => {
  it("maps Copilot request to provider format with model", () => {
    const result = transformCompletionRequest(
      { prompt: "function hello() {", max_tokens: 100, temperature: 0.5 },
      "deepseek-coder",
    );
    expect(result).toEqual({
      model: "deepseek-coder",
      prompt: "function hello() {",
      suffix: undefined,
      max_tokens: 100,
      temperature: 0.5,
      top_p: undefined,
      n: 1,
      stop: undefined,
      stream: false,
    });
  });

  it("applies defaults for missing fields", () => {
    const result = transformCompletionRequest({ prompt: "test" }, "qwen-coder");
    expect(result.max_tokens).toBe(500);
    expect(result.temperature).toBe(0.2);
    expect(result.n).toBe(1);
    expect(result.stream).toBe(false);
  });

  it("preserves suffix and stop tokens", () => {
    const result = transformCompletionRequest(
      { prompt: "a", suffix: "b", stop: ["\n", "//"] },
      "m",
    );
    expect(result.suffix).toBe("b");
    expect(result.stop).toEqual(["\n", "//"]);
  });
});

describe("transformChatRequest", () => {
  it("maps Copilot chat request to provider format", () => {
    const messages = [{ role: "user", content: "hello" }];
    const result = transformChatRequest({ messages, max_tokens: 2048, stream: true }, "glm-4");
    expect(result).toEqual({
      model: "glm-4",
      messages,
      max_tokens: 2048,
      temperature: 0.2,
      top_p: undefined,
      stream: true,
      stop: undefined,
    });
  });

  it("applies defaults for missing fields", () => {
    const result = transformChatRequest({ messages: [{ role: "user", content: "test" }] }, "m");
    expect(result.max_tokens).toBe(4096);
    expect(result.temperature).toBe(0.2);
    expect(result.stream).toBe(false);
  });
});

describe("transformCompletionResponse", () => {
  it("wraps provider response in Copilot format", () => {
    const result = transformCompletionResponse(
      {
        choices: [{ text: "world", index: 0, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      },
      "deepseek-coder",
    );

    expect(result.object).toBe("text_completion");
    expect(result.model).toBe("deepseek-coder");
    expect(result.id).toMatch(/^cmpl-/);
    expect(result.created).toBeGreaterThan(0);
    expect(result.choices).toEqual([{ text: "world", index: 0, finish_reason: "stop" }]);
    expect(result.usage).toEqual({
      prompt_tokens: 5,
      completion_tokens: 1,
      total_tokens: 6,
    });
  });

  it("fills in defaults for sparse response", () => {
    const result = transformCompletionResponse({ choices: [{}] }, "m");
    expect(result.choices[0]).toEqual({ text: "", index: 0, finish_reason: null });
  });
});

describe("transformChatResponse", () => {
  it("wraps provider chat response in Copilot format", () => {
    const result = transformChatResponse(
      {
        choices: [
          {
            message: { role: "assistant", content: "Hi!" },
            index: 0,
            finish_reason: "stop",
          },
        ],
      },
      "glm-4",
    );

    expect(result.object).toBe("chat.completion");
    expect(result.model).toBe("glm-4");
    expect(result.choices[0].message).toEqual({ role: "assistant", content: "Hi!" });
  });

  it("fills in defaults for missing message", () => {
    const result = transformChatResponse({ choices: [{}] }, "m");
    expect(result.choices[0].message).toEqual({ role: "assistant", content: "" });
  });

  it("falls back to delta when message is undefined", () => {
    const result = transformChatResponse(
      {
        choices: [
          { delta: { role: "assistant", content: "streamed" }, index: 0, finish_reason: null },
        ],
      },
      "m",
    );
    expect(result.choices[0].message).toEqual({ role: "assistant", content: "streamed" });
  });
});

describe("transformChatStreamChunk", () => {
  it("produces chat.completion.chunk with delta", () => {
    const result = transformChatStreamChunk(
      { choices: [{ delta: { role: "assistant", content: "Hi" }, index: 0, finish_reason: null }] },
      "glm-4",
    );
    expect(result.object).toBe("chat.completion.chunk");
    expect(result.model).toBe("glm-4");
    expect(result.choices[0].delta).toEqual({ role: "assistant", content: "Hi" });
    expect(result.choices[0].finish_reason).toBeNull();
  });

  it("handles empty delta content", () => {
    const result = transformChatStreamChunk(
      { choices: [{ delta: {}, index: 0, finish_reason: null }] },
      "m",
    );
    expect(result.choices[0].delta).toEqual({ role: undefined, content: "" });
  });

  it("uses message fields as fallback when delta is missing", () => {
    const result = transformChatStreamChunk(
      {
        choices: [
          { message: { role: "assistant", content: "fallback" }, index: 0, finish_reason: "stop" },
        ],
      },
      "m",
    );
    expect(result.choices[0].delta.content).toBe("fallback");
    expect(result.choices[0].finish_reason).toBe("stop");
  });
});

describe("SSE helpers", () => {
  it("parseSseData extracts JSON from data line", () => {
    const result = parseSseData('data: {"text": "hello"}');
    expect(result).toEqual({ text: "hello" });
  });

  it("parseSseData returns null for [DONE]", () => {
    expect(parseSseData("data: [DONE]")).toBeNull();
  });

  it("parseSseData returns null for non-data lines", () => {
    expect(parseSseData("event: ping")).toBeNull();
    expect(parseSseData("")).toBeNull();
  });

  it("parseSseData returns null for invalid JSON", () => {
    expect(parseSseData("data: not-json")).toBeNull();
  });

  it("formatSseData produces correct SSE format", () => {
    const result = formatSseData({ text: "hi" });
    expect(result).toBe('data: {"text":"hi"}\n\n');
  });

  it("formatSseDone produces correct ending", () => {
    expect(formatSseDone()).toBe("data: [DONE]\n\n");
  });
});
