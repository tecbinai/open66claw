/**
 * 通过 Session Webhook 发送文本消息（快速回复，无需额外鉴权）
 */
export async function sendDingtalkMessage(sessionWebhook: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(sessionWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "text",
        text: { content: text },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
