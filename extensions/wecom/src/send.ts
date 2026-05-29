/**
 * 获取企微 access_token
 */
export async function getWecomAccessToken(
  corpId: string,
  appSecret: string,
): Promise<string | null> {
  try {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${appSecret}`;
    const response = await fetch(url);
    const data = (await response.json()) as { access_token?: string; errcode?: number };
    if (data.errcode === 0 && data.access_token) {
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 发送企微文本消息
 */
export async function sendWecomMessage(
  accessToken: string,
  toUser: string,
  agentId: number,
  text: string,
): Promise<boolean> {
  try {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: toUser,
        msgtype: "text",
        agentid: agentId,
        text: { content: text },
      }),
    });
    const data = (await response.json()) as { errcode?: number };
    return data.errcode === 0;
  } catch {
    return false;
  }
}
