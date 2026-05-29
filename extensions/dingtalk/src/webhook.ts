import { createHmac } from "node:crypto";

/**
 * 验证钉钉 Webhook 签名
 * @param timestamp - 请求头中的 timestamp
 * @param sign - 请求头中的 sign
 * @param appSecret - 应用密钥
 */
export function verifyDingtalkSignature(
  timestamp: string,
  sign: string,
  appSecret: string,
): boolean {
  const stringToSign = timestamp + "\n" + appSecret;
  const hmac = createHmac("sha256", appSecret).update(stringToSign).digest("base64");
  return hmac === sign;
}

/**
 * 从 Webhook payload 中提取文本消息
 */
export function extractMessageText(payload: Record<string, unknown>): string | null {
  if (typeof payload.text === "object" && payload.text !== null) {
    const text = (payload.text as Record<string, unknown>).content;
    return typeof text === "string" ? text.trim() : null;
  }
  return null;
}
