import { describe, it, expect } from "vitest";
import type {
  SetupWizardState,
  SetupApiResponse,
  ValidateApiKeyRequest,
  VerifyApiKeyRequest,
  ConfigureProviderRequest,
  ConfigureWorkspaceRequest,
  ConfigureSecurityRequest,
  ConfigureChannelsRequest,
  FetchModelsRequest,
} from "../setup-wizard-types.js";

describe("setup-wizard-types", () => {
  it("SetupWizardState should accept valid state", () => {
    const state: SetupWizardState = {
      step: 1,
      completed: false,
      region: "cn",
      provider: "openai",
      apiKeyConfigured: true,
      channelsConfigured: ["dingtalk"],
      workspaceConfigured: true,
      securityConfigured: true,
    };
    expect(state.step).toBe(1);
    expect(state.region).toBe("cn");
  });

  it("SetupApiResponse should accept ok response", () => {
    const resp: SetupApiResponse<{ models: string[] }> = {
      ok: true,
      data: { models: ["gpt-4"] },
    };
    expect(resp.ok).toBe(true);
    expect(resp.data?.models).toContain("gpt-4");
  });

  it("SetupApiResponse should accept error response", () => {
    const resp: SetupApiResponse = { ok: false, error: "Invalid API key" };
    expect(resp.ok).toBe(false);
    expect(resp.error).toBe("Invalid API key");
  });

  it("ValidateApiKeyRequest should have required fields", () => {
    const req: ValidateApiKeyRequest = { provider: "openai", apiKey: "sk-xxx" };
    expect(req.provider).toBe("openai");
  });

  it("VerifyApiKeyRequest should support optional fields", () => {
    const req: VerifyApiKeyRequest = {
      provider: "custom",
      apiKey: "sk-xxx",
      model: "gpt-4",
      endpoint: "https://custom.api/v1",
    };
    expect(req.endpoint).toBeDefined();
  });

  it("ConfigureProviderRequest should support custom provider", () => {
    const req: ConfigureProviderRequest = {
      provider: "custom",
      apiKey: "sk-xxx",
      baseUrl: "https://custom.api",
    };
    expect(req.baseUrl).toBeDefined();
  });

  it("ConfigureWorkspaceRequest should accept workspace path", () => {
    const req: ConfigureWorkspaceRequest = {
      workspace: "/home/user/workspace",
      additionalDirs: ["/home/user/docs"],
    };
    expect(req.additionalDirs).toHaveLength(1);
  });

  it("ConfigureSecurityRequest should support both modes", () => {
    const standard: ConfigureSecurityRequest = { mode: "standard" };
    const trust: ConfigureSecurityRequest = {
      mode: "trust",
      trustedDirs: ["/home/user"],
    };
    expect(standard.mode).toBe("standard");
    expect(trust.trustedDirs).toHaveLength(1);
  });

  it("ConfigureChannelsRequest should support all channel types", () => {
    const req: ConfigureChannelsRequest = {
      channels: ["dingtalk", "feishu"],
      dingtalk: { appKey: "key", appSecret: "secret" },
      feishu: { appId: "id", appSecret: "secret" },
    };
    expect(req.channels).toHaveLength(2);
    expect(req.dingtalk?.appKey).toBe("key");
  });

  it("FetchModelsRequest should accept provider with optional fields", () => {
    const req: FetchModelsRequest = {
      provider: "openai",
      apiKey: "sk-xxx",
      baseUrl: "https://api.openai.com",
    };
    expect(req.provider).toBe("openai");
  });
});
