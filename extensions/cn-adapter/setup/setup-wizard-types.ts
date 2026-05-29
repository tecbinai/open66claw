/**
 * Setup Wizard - Type Definitions
 * 配置向导的所有类型定义（cn-adapter 版本）
 */

// ============================================================================
// 渠道启动回调类型
// ============================================================================

export type ChannelStartCallback = (channelId: string, accountId?: string) => Promise<void>;

// ============================================================================
// Setup Wizard 状态类型
// ============================================================================

export interface SetupWizardState {
  step: number;
  completed: boolean;
  region: "cn" | "global";
  provider?: string;
  apiKeyConfigured?: boolean;
  channelsConfigured?: string[];
  workspaceConfigured?: boolean;
  securityConfigured?: boolean;
}

// ============================================================================
// API 响应/请求类型
// ============================================================================

export interface SetupApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ValidateApiKeyRequest {
  provider: string;
  apiKey: string;
}

export interface VerifyApiKeyRequest {
  provider: string;
  apiKey: string;
  model?: string;
  /** 自定义 API 端点 (仅 provider=custom 时使用) */
  endpoint?: string;
}

export interface ConfigureProviderRequest {
  provider: string;
  apiKey: string;
  model?: string;
  /** 自定义 API 端点 (仅 provider=custom 时使用) */
  endpoint?: string;
  /** Base URL (仅 provider=custom 时使用) */
  baseUrl?: string;
}

export interface ConfigureWorkspaceRequest {
  workspace: string;
  additionalDirs?: string[];
}

export interface ConfigureSecurityRequest {
  mode: "standard" | "trust";
  trustedDirs?: string[];
}

export interface ConfigureChannelsRequest {
  channels?: string[];
  dingtalk?: {
    appKey: string;
    appSecret: string;
    robotToken?: string;
  };
  feishu?: {
    appId: string;
    appSecret: string;
    encryptKey?: string;
    verificationToken?: string;
  };
  wecom?: {
    corpId: string;
    agentId: number;
    agentSecret: string;
    token?: string;
    encodingAESKey?: string;
  };
  qqbot?: {
    appId: string;
    appSecret: string;
    token?: string;
    sandbox?: boolean;
  };
}

export interface FetchModelsRequest {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}
