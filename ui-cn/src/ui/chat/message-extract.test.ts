import { describe, expect, it } from "vitest";
import {
  extractText,
  extractTextCached,
  extractThinking,
  extractThinkingCached,
} from "./message-extract";

describe("extractText", () => {
  it("strips [[reply_to:...]] directive tags", () => {
    const message = {
      role: "assistant",
      content: "Hello there [[reply_to:abc-123]]",
    };
    expect(extractText(message)).toBe("Hello there");
  });

  it("strips [[reply_to_current]] directive tags", () => {
    const message = {
      role: "assistant",
      content: "Hello [[reply_to_current]] there",
    };
    expect(extractText(message)).toBe("Hello there");
  });

  it("strips [[audio_as_voice]] directive tags", () => {
    const message = {
      role: "assistant",
      content: "Listen [[audio_as_voice]] to this",
    };
    expect(extractText(message)).toBe("Listen to this");
  });

  it("strips directive tags with whitespace variations", () => {
    const message = {
      role: "assistant",
      content: "Hello [[ reply_to : abc-123 ]] there",
    };
    expect(extractText(message)).toBe("Hello there");
  });

  it("strips multiple directive tags", () => {
    const message = {
      role: "assistant",
      content: "Hello [[reply_to_current]] there [[reply_to:xyz]]",
    };
    expect(extractText(message)).toBe("Hello there");
  });

  it("handles message at end with reply tag", () => {
    const message = {
      role: "assistant",
      content:
        "完成后告诉我，我再帮你打开天气页面! 👉\n[[reply_to:882da8d4-5077-41df-ae42-924c4bd0d8d1]]",
    };
    expect(extractText(message)).toBe("完成后告诉我，我再帮你打开天气页面! 👉");
  });
});

describe("extractTextCached", () => {
  it("matches extractText output", () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "Hello there" }],
    };
    expect(extractTextCached(message)).toBe(extractText(message));
  });

  it("returns consistent output for repeated calls", () => {
    const message = {
      role: "user",
      content: "plain text",
    };
    expect(extractTextCached(message)).toBe("plain text");
    expect(extractTextCached(message)).toBe("plain text");
  });
});

describe("extractThinkingCached", () => {
  it("matches extractThinking output", () => {
    const message = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Plan A" }],
    };
    expect(extractThinkingCached(message)).toBe(extractThinking(message));
  });

  it("returns consistent output for repeated calls", () => {
    const message = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Plan A" }],
    };
    expect(extractThinkingCached(message)).toBe("Plan A");
    expect(extractThinkingCached(message)).toBe("Plan A");
  });
});
