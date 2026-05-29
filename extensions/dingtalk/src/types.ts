export type DingtalkAccount = {
  enabled?: boolean;
  botToken: string; // 机器人 Webhook access_token
  appSecret: string; // 签名密钥
};

export type DingtalkWebhookPayload = {
  msgtype: string;
  text?: { content: string };
  msgId: string;
  createAt: string;
  conversationType: "1" | "2"; // 1=单聊, 2=群聊
  conversationId: string;
  conversationTitle?: string;
  senderId: string;
  senderNick: string;
  senderStaffId?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
};

export type DingtalkConfig = {
  accounts?: Record<string, DingtalkAccount>;
};
