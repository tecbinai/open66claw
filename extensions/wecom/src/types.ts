export type WecomAccount = {
  enabled?: boolean;
  corpId: string; // 企业 ID
  appSecret: string; // 应用密钥
  agentId: number; // 应用 AgentId
  token?: string; // 接收消息的 Token（Webhook 验证用）
  encodingAesKey?: string; // 消息加解密密钥
};

export type WecomMessagePayload = {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId?: string;
  AgentID?: number;
};
