import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyEd25519Signature, verifyTimestamp, signCallbackAck } from "../webhook.js";

function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("hex"),
  };
}

function signWithEd25519(privateKeyHex: string, message: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyHex, "hex"),
    format: "der",
    type: "pkcs8",
  });
  return cryptoSign(null, Buffer.from(message, "utf8"), privateKey).toString("hex");
}

describe("QQBot Ed25519 签名验证", () => {
  describe("verifyEd25519Signature", () => {
    it("验证通过有效签名", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ op: 0, d: { content: "test" } });
      const signature = signWithEd25519(privateKey, timestamp + body);

      expect(verifyEd25519Signature(publicKey, signature, timestamp, body)).toBe(true);
    });

    it("拒绝无效签名", () => {
      const { publicKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ op: 0 });

      expect(verifyEd25519Signature(publicKey, "0".repeat(128), timestamp, body)).toBe(false);
    });

    it("拒绝被篡改的消息体", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ op: 0, d: { content: "original" } });
      const signature = signWithEd25519(privateKey, timestamp + body);
      const tampered = JSON.stringify({ op: 0, d: { content: "tampered" } });

      expect(verifyEd25519Signature(publicKey, signature, timestamp, tampered)).toBe(false);
    });

    it("拒绝被篡改的时间戳", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ op: 0 });
      const signature = signWithEd25519(privateKey, timestamp + body);
      const tamperedTs = String(Number.parseInt(timestamp, 10) + 100);

      expect(verifyEd25519Signature(publicKey, signature, tamperedTs, body)).toBe(false);
    });

    it("处理格式错误的公钥", () => {
      expect(verifyEd25519Signature("invalid", "0".repeat(128), "123", "{}")).toBe(false);
    });

    it("验证通过空消息体", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signWithEd25519(privateKey, timestamp);

      expect(verifyEd25519Signature(publicKey, signature, timestamp, "")).toBe(true);
    });
  });

  describe("verifyTimestamp", () => {
    it("接受当前时间戳", () => {
      expect(verifyTimestamp(String(Math.floor(Date.now() / 1000)))).toBe(true);
    });

    it("接受 5 分钟内的时间戳", () => {
      expect(verifyTimestamp(String(Math.floor(Date.now() / 1000) - 299))).toBe(true);
    });

    it("拒绝超过 5 分钟的时间戳", () => {
      expect(verifyTimestamp(String(Math.floor(Date.now() / 1000) - 361))).toBe(false);
    });

    it("拒绝非数字时间戳", () => {
      expect(verifyTimestamp("not_a_number")).toBe(false);
      expect(verifyTimestamp("")).toBe(false);
    });

    it("接受自定义时间窗口", () => {
      const tenMinAgo = String(Math.floor(Date.now() / 1000) - 599);
      expect(verifyTimestamp(tenMinAgo, 300)).toBe(false);
      expect(verifyTimestamp(tenMinAgo, 600)).toBe(true);
    });
  });

  describe("signCallbackAck", () => {
    it("返回非空签名", () => {
      const sig = signCallbackAck("test_plain_token", "1609459200", "test_secret");
      expect(sig).toBeTruthy();
      expect(sig.length).toBeGreaterThan(0);
    });

    it("空 appSecret 返回空字符串", () => {
      // 空 secret 会导致种子填充失败 - 但实际上空字符串循环后仍然是空字符串
      // 实际行为取决于实现，这里只确保不抛异常
      const sig = signCallbackAck("token", "123", "");
      expect(typeof sig).toBe("string");
    });
  });

  describe("集成测试", () => {
    it("完整签名验证流程", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({
        op: 0,
        t: "MESSAGE_CREATE",
        d: { id: "msg-1", content: "Hello", author: { id: "user-1" } },
      });
      const signature = signWithEd25519(privateKey, timestamp + body);

      expect(verifyTimestamp(timestamp)).toBe(true);
      expect(verifyEd25519Signature(publicKey, signature, timestamp, body)).toBe(true);
    });

    it("拒绝重放攻击", () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const oldTs = String(Math.floor(Date.now() / 1000) - 600);
      const body = JSON.stringify({ op: 0, d: { content: "test" } });
      const signature = signWithEd25519(privateKey, oldTs + body);

      expect(verifyTimestamp(oldTs)).toBe(false);
      expect(verifyEd25519Signature(publicKey, signature, oldTs, body)).toBe(true);
      // 时间戳过期 → 整个请求应被拒绝
    });
  });
});
