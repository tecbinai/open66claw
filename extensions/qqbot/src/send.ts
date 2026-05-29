/**
 * QQ 机器人消息发送
 * 基于 QQ 开放平台 API v2
 */

const API_BASE = "https://api.sgroup.qq.com";
const SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId, clientSecret: appSecret }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
  return data.access_token;
}

export function clearTokenCache(): void {
  tokenCache = null;
}

/**
 * 通用发送消息
 * target 格式: c2c:<openId> | group:<groupOpenId> | channel:<channelId>
 */
export async function sendQqbotMessage(
  appId: string,
  appSecret: string,
  target: string,
  content: string,
  sandbox?: boolean,
): Promise<boolean> {
  try {
    const token = await getAccessToken(appId, appSecret);
    const base = sandbox ? SANDBOX_API_BASE : API_BASE;
    const [type, id] = target.split(":");

    let url: string;
    switch (type) {
      case "group":
        url = `${base}/v2/groups/${id}/messages`;
        break;
      case "channel":
        url = `${base}/channels/${id}/messages`;
        break;
      case "c2c":
      case "user":
      default:
        url = `${base}/v2/users/${id ?? target}/messages`;
        break;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `QQBot ${token}`,
      },
      body: JSON.stringify({ content, msg_type: 0 }),
    });

    return res.ok;
  } catch {
    return false;
  }
}
