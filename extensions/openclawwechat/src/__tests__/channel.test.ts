import { describe, it, expect } from "vitest";
import { BRIDGE_URL, CHANNEL_ID } from "../types.js";

describe("openclawwechat 常量", () => {
  it("CHANNEL_ID 为 openclawwechat", () => {
    expect(CHANNEL_ID).toBe("openclawwechat");
  });

  it("BRIDGE_URL 指向 ClawChat 桥接服务", () => {
    expect(BRIDGE_URL).toMatch(/^https:\/\/api\.clawchat/);
  });
});

describe("openclawwechat channel plugin", () => {
  it("能正确导入 channel 模块", async () => {
    const mod = await import("../channel.js");
    expect(mod.openclawwechatPlugin).toBeDefined();
    expect(mod.openclawwechatPlugin.id).toBe("openclawwechat");
  });

  it("meta 包含正确的别名", async () => {
    const { openclawwechatPlugin } = await import("../channel.js");
    expect(openclawwechatPlugin.meta.aliases).toContain("wechat");
    expect(openclawwechatPlugin.meta.aliases).toContain("wx");
  });

  it("capabilities 标记为 direct 聊天", async () => {
    const { openclawwechatPlugin } = await import("../channel.js");
    expect(openclawwechatPlugin.capabilities.chatTypes).toContain("direct");
  });

  it("deliveryMode 为 gateway", async () => {
    const { openclawwechatPlugin } = await import("../channel.js");
    expect(openclawwechatPlugin.outbound!.deliveryMode).toBe("gateway");
  });
});
