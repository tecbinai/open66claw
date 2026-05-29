/**
 * QQ 机器人 Webhook 签名验证
 * 基于 Ed25519 算法
 */

import { verify as cryptoVerify, sign as cryptoSign, createPrivateKey } from "node:crypto";

/**
 * 验证 Ed25519 签名
 * @param publicKeyHex - 公钥 (hex, DER/SPKI 格式)
 * @param signatureHex - 签名 (hex)
 * @param timestamp - 请求时间戳
 * @param body - 请求体原始字符串
 */
export function verifyEd25519Signature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    const message = timestamp + body;
    return cryptoVerify(
      null,
      Buffer.from(message, "utf8"),
      { key: Buffer.from(publicKeyHex, "hex"), format: "der", type: "spki" },
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * 验证请求时间戳（防重放）
 * @param timestamp - 秒级时间戳字符串
 * @param maxAgeSeconds - 最大允许偏差，默认 300 秒
 */
export function verifyTimestamp(timestamp: string, maxAgeSeconds = 300): boolean {
  const requestTime = Number.parseInt(timestamp, 10);
  if (Number.isNaN(requestTime)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - requestTime) <= maxAgeSeconds;
}

/**
 * 生成 HTTP Callback ACK 签名
 * QQ 开放平台 URL 验证时使用
 */
export function signCallbackAck(plainToken: string, eventTs: string, appSecret: string): string {
  try {
    if (!appSecret) return "";
    const msg = Buffer.from(eventTs + plainToken, "utf-8");
    let seedStr = appSecret;
    while (Buffer.byteLength(seedStr, "utf-8") < 32) {
      seedStr = seedStr + seedStr;
    }
    const seedBuffer = Buffer.from(seedStr, "utf-8").subarray(0, 32);
    const derPrefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const privateKey = createPrivateKey({
      key: Buffer.concat([derPrefix, seedBuffer]),
      format: "der",
      type: "pkcs8",
    });
    return cryptoSign(null, msg, privateKey).toString("hex");
  } catch {
    return "";
  }
}
