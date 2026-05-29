import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyDingtalkSignature, extractMessageText } from "../webhook.js";

describe("verifyDingtalkSignature", () => {
  it("returns true for correct signature", () => {
    const timestamp = "1609459200000";
    const appSecret = "test-secret-key";
    const expected = createHmac("sha256", appSecret)
      .update(timestamp + "\n" + appSecret)
      .digest("base64");
    expect(verifyDingtalkSignature(timestamp, expected, appSecret)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyDingtalkSignature("123", "wrong", "secret")).toBe(false);
  });
});

describe("extractMessageText", () => {
  it("extracts text content", () => {
    expect(extractMessageText({ text: { content: "hello" } })).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(extractMessageText({ text: { content: "  hello  " } })).toBe("hello");
  });

  it("returns null for non-text", () => {
    expect(extractMessageText({ image: {} })).toBeNull();
  });
});
