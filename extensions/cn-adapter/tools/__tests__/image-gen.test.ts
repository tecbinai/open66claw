import { describe, it, expect, vi, beforeEach } from "vitest";
import { createImageGenTool } from "../image-gen.js";

// Mock dependencies
vi.mock("../../media/chat-image-store.js", () => ({
  saveGeneratedImage: vi.fn().mockResolvedValue({ id: "test-id", file: "/tmp/test.png" }),
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
  resolveImageGenModel: vi.fn(),
}));

import { resolveImageGenModel } from "../model-resolver.js";

describe("createImageGenTool", () => {
  const tool = createImageGenTool("test-session");

  it("should create tool with correct metadata", () => {
    expect(tool.name).toBe("image_gen");
    expect(tool.label).toBe("Image Generation");
    expect(tool.description).toContain("Generate images");
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
    vi.mocked(resolveImageGenModel).mockResolvedValue(null);
    const result = await tool.execute("call-3", { prompt: "a cat" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No image generation model configured"),
    });
    expect(result.details).toMatchObject({ error: "no_image_gen_model" });
  });

  describe("with mocked provider", () => {
    beforeEach(() => {
      vi.mocked(resolveImageGenModel).mockResolvedValue({
        providerId: "openai",
        modelId: "dall-e-3",
        apiKey: "sk-test",
        baseUrl: "",
      });
    });

    it("should handle API errors gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await tool.execute("call-4", { prompt: "a cat" });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("failed"),
      });
      expect(result.details).toHaveProperty("error");

      vi.unstubAllGlobals();
    });

    it("should handle successful generation", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ b64_json: "dGVzdA==", revised_prompt: "a cute cat" }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await tool.execute("call-5", {
        prompt: "a cat",
        size: "1024x1024",
        style: "vivid",
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Image generated successfully"),
      });
      expect(result.details).toMatchObject({
        provider: "openai",
        prompt: "a cat",
        size: "1024x1024",
      });

      vi.unstubAllGlobals();
    });

    it("should use default values for optional params", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ b64_json: "dGVzdA==" }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await tool.execute("call-6", { prompt: "a dog" });
      expect(result.details).toMatchObject({
        size: "1024x1024",
        style: "vivid",
      });

      vi.unstubAllGlobals();
    });
  });
});
