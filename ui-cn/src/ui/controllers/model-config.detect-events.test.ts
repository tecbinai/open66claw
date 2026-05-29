/**
 * model-config Controller — detect broadcast event handler 测试
 *
 * 验证:
 * 1. handleDetectProgressEvent 正确更新进度状态
 * 2. handleDetectCompleteEvent 成功时流转到 result 步骤
 * 3. handleDetectCompleteEvent 失败时回退到 apikey 步骤
 * 4. 非检测状态下收到事件时的 guard（不修改状态）
 * 5. 重复模型 ID 的 progress 更新（覆盖而非追加）
 */

import { describe, it, expect, vi } from "vitest";
import {
  createInitialModelConfigState,
  handleDetectProgressEvent,
  handleDetectCompleteEvent,
  type ModelConfigState,
} from "./model-config.js";

/** 创建处于 detecting 状态的 host */
function detectingHost(overrides?: Partial<ModelConfigState>) {
  return {
    ...createInitialModelConfigState(),
    client: { request: vi.fn() },
    connected: true,
    providerConfigDetecting: true,
    providerConfigStep: "detecting" as const,
    providerConfigDetectPhase: "scanning" as const,
    providerConfigDetectAbort: new AbortController(),
    providerConfigDetectTotal: 5,
    providerConfigDetectCompleted: 0,
    providerConfigDetectModels: [],
    ...overrides,
  };
}

describe("handleDetectProgressEvent", () => {
  it("更新 completed/total 并添加新模型条目", () => {
    const host = detectingHost();

    handleDetectProgressEvent(host, {
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      status: "ok",
      message: "可用",
      completed: 1,
      total: 5,
    });

    expect(host.providerConfigDetectCompleted).toBe(1);
    expect(host.providerConfigDetectTotal).toBe(5);
    expect(host.providerConfigDetectModels).toHaveLength(1);
    expect(host.providerConfigDetectModels[0]).toEqual({
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      status: "ok",
      message: "可用",
    });
  });

  it("重复 modelId 更新已有条目而非追加", () => {
    const host = detectingHost({
      providerConfigDetectModels: [
        { modelId: "gpt-4o", modelName: "GPT-4o", status: "pending" as const },
      ],
    });

    handleDetectProgressEvent(host, {
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      status: "ok",
      message: "验证成功",
      completed: 1,
      total: 3,
    });

    // Should still be 1 entry, not 2
    expect(host.providerConfigDetectModels).toHaveLength(1);
    expect(host.providerConfigDetectModels[0].status).toBe("ok");
    expect(host.providerConfigDetectModels[0].message).toBe("验证成功");
  });

  it("多个不同模型的 progress 正确追加", () => {
    const host = detectingHost();

    handleDetectProgressEvent(host, {
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      status: "ok",
      completed: 1,
      total: 3,
    });

    handleDetectProgressEvent(host, {
      modelId: "gpt-3.5",
      modelName: "GPT-3.5",
      status: "failed",
      message: "模型不可用",
      completed: 2,
      total: 3,
    });

    expect(host.providerConfigDetectModels).toHaveLength(2);
    expect(host.providerConfigDetectCompleted).toBe(2);
  });

  it("非检测状态下收到事件不修改任何字段", () => {
    const host = detectingHost({ providerConfigDetecting: false });
    const originalModels = [...host.providerConfigDetectModels];

    handleDetectProgressEvent(host, {
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      status: "ok",
      completed: 1,
      total: 1,
    });

    expect(host.providerConfigDetectModels).toEqual(originalModels);
    expect(host.providerConfigDetectCompleted).toBe(0);
  });
});

describe("handleDetectCompleteEvent", () => {
  it("成功时设置 result 步骤、解除 detecting、记录 autoEnabled", () => {
    const host = detectingHost();

    handleDetectCompleteEvent(host, {
      success: true,
      models: [
        { modelId: "gpt-4o", modelName: "GPT-4o", status: "ok" },
        { modelId: "dall-e-3", modelName: "DALL-E 3", status: "ok" },
      ],
      autoEnabled: { text: "gpt-4o", image: "dall-e-3" },
      availableCount: 2,
      failedCount: 0,
    });

    expect(host.providerConfigStep).toBe("result");
    expect(host.providerConfigDetecting).toBe(false);
    expect(host.providerConfigDetectAbort).toBeNull();
    expect(host.providerConfigTestResult?.success).toBe(true);
    expect(host.providerConfigTestResult?.message).toContain("2 个模型可用");
    expect(host.providerConfigAutoEnabled).toEqual({ text: "gpt-4o", image: "dall-e-3" });
    expect(host.providerConfigDetectModels).toHaveLength(2);
  });

  it("成功时消息包含失败模型数", () => {
    const host = detectingHost();

    handleDetectCompleteEvent(host, {
      success: true,
      models: [
        { modelId: "gpt-4o", modelName: "GPT-4o", status: "ok" },
        { modelId: "bad-model", modelName: "Bad", status: "failed" },
      ],
      autoEnabled: { text: "gpt-4o" },
      availableCount: 1,
      failedCount: 1,
    });

    expect(host.providerConfigTestResult?.message).toContain("1 个不可用");
  });

  it("失败时回退到 apikey 步骤并显示错误", () => {
    const host = detectingHost();

    handleDetectCompleteEvent(host, {
      success: false,
      models: [],
      autoEnabled: {},
      availableCount: 0,
      failedCount: 0,
      error: "Invalid API key",
    });

    expect(host.providerConfigStep).toBe("apikey");
    expect(host.providerConfigDetecting).toBe(false);
    expect(host.providerConfigTestResult?.success).toBe(false);
    // 应翻译错误信息
    expect(host.providerConfigTestResult?.message).toContain("API 密钥无效");
  });

  it("非检测状态下收到 complete 事件不修改任何字段", () => {
    const host = detectingHost({
      providerConfigDetecting: false,
      providerConfigStep: "apikey" as const,
    });

    handleDetectCompleteEvent(host, {
      success: true,
      models: [{ modelId: "x", modelName: "X", status: "ok" }],
      autoEnabled: { text: "x" },
      availableCount: 1,
      failedCount: 0,
    });

    // Should NOT change to "result"
    expect(host.providerConfigStep).toBe("apikey");
    expect(host.providerConfigAutoEnabled).toBeNull();
  });

  it("complete 事件更新最终的模型列表", () => {
    const host = detectingHost({
      providerConfigDetectModels: [
        { modelId: "old", modelName: "Old", status: "pending" as const },
      ],
    });

    handleDetectCompleteEvent(host, {
      success: true,
      models: [
        { modelId: "gpt-4o", modelName: "GPT-4o", status: "ok" },
        { modelId: "gpt-3.5", modelName: "GPT-3.5", status: "skipped", message: "已存在" },
      ],
      autoEnabled: { text: "gpt-4o" },
      availableCount: 2,
      failedCount: 0,
    });

    // Final models list should replace the old one
    expect(host.providerConfigDetectModels).toHaveLength(2);
    expect(host.providerConfigDetectModels[0].modelId).toBe("gpt-4o");
    expect(host.providerConfigDetectModels[1].modelId).toBe("gpt-3.5");
    expect(host.providerConfigDetectCompleted).toBe(2);
  });
});
