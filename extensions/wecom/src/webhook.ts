import { createHash } from "node:crypto";

/**
 * 验证企微回调签名
 * signature = SHA1(sort([token, timestamp, nonce, echostr]))
 */
export function verifyWecomSignature(
  token: string,
  timestamp: string,
  nonce: string,
  echostr: string,
  signature: string,
): boolean {
  const arr = [token, timestamp, nonce, echostr].sort();
  const hash = createHash("sha1").update(arr.join("")).digest("hex");
  return hash === signature;
}

/**
 * 简单 XML 解析（提取关键字段，不依赖 xml2js）
 */
export function parseWecomXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match CDATA fields: <Tag><![CDATA[value]]></Tag>
  const cdataRegex = /<(\w+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  let match;
  while ((match = cdataRegex.exec(xml)) !== null) {
    if (match[1] && match[2] !== undefined) {
      result[match[1]] = match[2];
    }
  }
  // Match plain fields: <Tag>value</Tag>
  const plainRegex = /<(\w+)>([^<]+)<\/\1>/g;
  while ((match = plainRegex.exec(xml)) !== null) {
    if (match[1] && match[2] !== undefined && !(match[1] in result)) {
      result[match[1]] = match[2];
    }
  }
  return result;
}
