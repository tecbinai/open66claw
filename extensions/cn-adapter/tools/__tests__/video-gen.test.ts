import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVideoGenTool } from "../video-gen.js";

vi.mock("../../media/chat-video-store.js", () => ({
  saveGeneratedVideo: vi.fn().mockResolvedValue({ id: "test-id", file: "/tmp/test.mp4" }),
}));

vi.mock("../../utils/index.js", () => ({
  createCnLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../model-resolver.js", () => ({
  resolveVideoGenModel: vi.fn(),
}));

import { resolveVideoGenModel } from "../model-resolver.js";

describe("createVideoGenTool", () => {
  const tool = createVideoGenTool("test-session");

  it("should create tool with correct metadata", () => {
    expect(tool.name).toBe("video_gen");
    expect(tool.label).toBe("Video Generation");
    expect(tool.description).toContain("Generate short video");
    expect(tool.parameters).toBeDefined();
  });

  it("should return error when prompt is empty", async () => {
    const result = await tool.execute("call-1", { prompt: "" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("prompt is required"),
    });
    expect(result.details).toMatchObject({ error: "missing_prompt" });
  });

  it("should return error when prompt is missing", async () => {
    const result = await tool.execute("call-2", {});
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("prompt is required"),
    });
  });

  it("should return error when no model configured", async () => {
    vi.mocked(resolveVideoGenModel).mockResolvedValue(null);
    const result = await tool.execute("call-3", { prompt: "a flying bird" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No video generation model configured"),
    });
    expect(result.details).toMatchObject({ error: "no_video_gen_model" });
  });

  describe("with mocked Zhipu provider", () => {
    beforeEach(() => {
      vi.mocked(resolveVideoGenModel).mockResolvedValue({
        providerId: "zhipu",
        modelId: "cogvideox-flash",
        apiKey: "test-key",
        baseUrl: "",
      });
    });

    it("should handle submit failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await tool.execute("call-4", { prompt: "a flying bird" });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("failed"),
      });
      expect(result.details).toHaveProperty("error");

      vi.unstubAllGlobals();
    });

    it("should handle missing task ID in response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await tool.execute("call-5", { prompt: "a flying bird" });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("no task ID"),
      });

      vi.unstubAllGlobals();
    });
  });
});
