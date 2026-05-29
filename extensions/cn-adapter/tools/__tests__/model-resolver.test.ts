import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../gateway/provider-config-store.js", () => ({
  getCapabilityBindings: vi.fn(),
  getAllConfiguredProviders: vi.fn(),
  getProviderRawConfig: vi.fn(),
}));

vi.mock("../../utils/index.js", () => ({
  createCnLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  getCapabilityBindings,
  getAllConfiguredProviders,
  getProviderRawConfig,
} from "../../gateway/provider-config-store.js";
import { resolveImageGenModel, resolveVideoGenModel } from "../model-resolver.js";

describe("model-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCapabilityBindings).mockResolvedValue({});
    vi.mocked(getAllConfiguredProviders).mockResolvedValue({});
    vi.mocked(getProviderRawConfig).mockResolvedValue(null);
  });

  describe("resolveImageGenModel", () => {
    it("should return null when no model available", async () => {
      const result = await resolveImageGenModel();
      expect(result).toBeNull();
    });

    it("should resolve from capability binding", async () => {
      vi.mocked(getCapabilityBindings).mockResolvedValue({
        imageGen: { providerId: "openai", modelId: "dall-e-3" },
      });
      vi.mocked(getProviderRawConfig).mockResolvedValue({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com",
      } as any);

      const result = await resolveImageGenModel();
      expect(result).toMatchObject({
        providerId: "openai",
        modelId: "dall-e-3",
        apiKey: "sk-test",
      });
    });

    it("should remap Qwen-Image-Edit to Qwen-Image", async () => {
      vi.mocked(getCapabilityBindings).mockResolvedValue({
        imageGen: { providerId: "siliconflow", modelId: "Qwen/Qwen-Image-Edit" },
      });
      vi.mocked(getProviderRawConfig).mockResolvedValue({
        apiKey: "sk-sf",
        baseUrl: "",
      } as any);

      const result = await resolveImageGenModel();
      expect(result?.modelId).toBe("Qwen/Qwen-Image");
    });

    it("should auto-discover from configured providers", async () => {
      vi.mocked(getAllConfiguredProviders).mockResolvedValue({
        siliconflow: {
          apiKey: "sk-sf",
          baseUrl: "",
          models: [{ id: "Qwen/Qwen-Image" }, { id: "deepseek-v3" }],
        },
      } as any);

      const result = await resolveImageGenModel();
      expect(result).toMatchObject({
        providerId: "siliconflow",
        modelId: "Qwen/Qwen-Image",
      });
    });

    it("should fall back to well-known models", async () => {
      vi.mocked(getProviderRawConfig).mockImplementation(async (id: string) => {
        if (id === "siliconflow") return { apiKey: "sk-sf", baseUrl: "" } as any;
        return null;
      });

      const result = await resolveImageGenModel();
      expect(result).toMatchObject({
        providerId: "siliconflow",
        modelId: "Qwen/Qwen-Image",
      });
    });
  });

  describe("resolveVideoGenModel", () => {
    it("should return null when no model available", async () => {
      const result = await resolveVideoGenModel();
      expect(result).toBeNull();
    });

    it("should resolve from capability binding", async () => {
      vi.mocked(getCapabilityBindings).mockResolvedValue({
        videoGen: { providerId: "zhipu", modelId: "cogvideox-flash" },
      });
      vi.mocked(getProviderRawConfig).mockResolvedValue({
        apiKey: "glm-test",
        baseUrl: "",
      } as any);

      const result = await resolveVideoGenModel();
      expect(result).toMatchObject({
        providerId: "zhipu",
        modelId: "cogvideox-flash",
      });
    });

    it("should remap I2V to T2V when no image input", async () => {
      vi.mocked(getCapabilityBindings).mockResolvedValue({
        videoGen: { providerId: "siliconflow", modelId: "Wan-AI/Wan2.2-I2V-14B" },
      });
      vi.mocked(getProviderRawConfig).mockResolvedValue({
        apiKey: "sk-sf",
        baseUrl: "",
      } as any);

      const result = await resolveVideoGenModel(false);
      expect(result?.modelId).toBe("Wan-AI/Wan2.2-T2V-14B");
    });

    it("should keep I2V when has image input", async () => {
      vi.mocked(getCapabilityBindings).mockResolvedValue({
        videoGen: { providerId: "siliconflow", modelId: "Wan-AI/Wan2.2-I2V-14B" },
      });
      vi.mocked(getProviderRawConfig).mockResolvedValue({
        apiKey: "sk-sf",
        baseUrl: "",
      } as any);

      const result = await resolveVideoGenModel(true);
      expect(result?.modelId).toBe("Wan-AI/Wan2.2-I2V-14B");
    });

    it("should auto-discover video models", async () => {
      vi.mocked(getAllConfiguredProviders).mockResolvedValue({
        siliconflow: {
          apiKey: "sk-sf",
          baseUrl: "",
          models: [{ id: "Wan-AI/Wan2.2-T2V-A14B" }, { id: "deepseek-v3" }],
        },
      } as any);

      const result = await resolveVideoGenModel();
      expect(result).toMatchObject({
        providerId: "siliconflow",
        modelId: "Wan-AI/Wan2.2-T2V-A14B",
      });
    });
  });
});
