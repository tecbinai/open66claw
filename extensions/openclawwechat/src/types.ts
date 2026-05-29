/**
 * 个人微信渠道类型定义
 * 通过 ClawChat 桥接服务接入
 */

export interface WechatAccount {
  enabled?: boolean;
  apiKey: string;
  pollIntervalMs?: number;
  sessionKey?: string;
  debug?: boolean;
}

export interface WechatConfig {
  accounts?: Record<string, WechatAccount>;
}

/** ClawChat 桥接服务地址 */
export const BRIDGE_URL = "https://api.clawchat.mifengcdn.com";

/** 渠道 ID */
export const CHANNEL_ID = "openclawwechat";
