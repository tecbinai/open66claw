/**
 * 通过 ClawChat 桥接服务发送消息
 */

import { BRIDGE_URL } from "./types.js";

/**
 * 发送文本消息
 */
export async function sendWechatMessage(
  apiKey: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  try {
    const encodedKey = apiKey.replace(/:/g, "%3A");
    const res = await fetch(`${BRIDGE_URL}/bot${encodedKey}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}
