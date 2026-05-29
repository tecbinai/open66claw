import { describe, it, expect } from "vitest";
import { createModelResolveHandler } from "../model-resolve.js";

describe("createModelResolveHandler", () => {
  it("returns model override when config has default model", async () => {
    const handler = createModelResolveHandler(() => ({
      models: { default: { provider: "siliconflow", model: "deepseek-v3" } },
    }));
    const result = await handler({ prompt: "test" });
    expect(result).toEqual({
      modelOverride: "deepseek-v3",
      providerOverride: "siliconflow",
    });
  });

  it("returns undefined when no model configured", async () => {
    const handler = createModelResolveHandler(() => ({}));
    const result = await handler({ prompt: "test" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when models.default is missing", async () => {
    const handler = createModelResolveHandler(() => ({ models: {} }));
    const result = await handler({ prompt: "test" });
    expect(result).toBeUndefined();
  });
});
