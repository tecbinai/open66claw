import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWecomSignature, parseWecomXml } from "../webhook.js";

describe("verifyWecomSignature", () => {
  it("returns true for correct signature", () => {
    const token = "test-token";
    const timestamp = "1609459200";
    const nonce = "test-nonce";
    const echostr = "test-echostr";
    const arr = [token, timestamp, nonce, echostr].sort();
    const expected = createHash("sha1").update(arr.join("")).digest("hex");
    expect(verifyWecomSignature(token, timestamp, nonce, echostr, expected)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyWecomSignature("t", "ts", "n", "e", "wrong")).toBe(false);
  });
});

describe("parseWecomXml", () => {
  it("parses CDATA fields", () => {
    const xml =
      "<xml><Content><![CDATA[hello]]></Content><MsgType><![CDATA[text]]></MsgType></xml>";
    const result = parseWecomXml(xml);
    expect(result.Content).toBe("hello");
    expect(result.MsgType).toBe("text");
  });

  it("parses plain fields", () => {
    const xml = "<xml><CreateTime>1609459200</CreateTime><AgentID>1000001</AgentID></xml>";
    const result = parseWecomXml(xml);
    expect(result.CreateTime).toBe("1609459200");
    expect(result.AgentID).toBe("1000001");
  });
});
