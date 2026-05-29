/**
 * G2: Gateway 方法 scope 鉴权工具
 *
 * 与上游 src/gateway/method-scopes.ts 的 scope 体系对齐，
 * 对 cn-adapter 自身注册的 gateway 方法进行权限分层。
 *
 * CLI 本地用户默认拥有所有 scope，此检查主要保护多用户/企业部署场景。
 */

// 与上游 method-scopes.ts 保持一致的 scope 字符串常量
export const ADMIN_SCOPE = "operator.admin";
export const WRITE_SCOPE = "operator.write";
export const READ_SCOPE = "operator.read";

/**
 * 检查调用方是否持有所需 scope。
 * 持有 ADMIN_SCOPE 的调用方隐含所有权限。
 *
 * @returns true 表示鉴权通过，false 表示已响应 UNAUTHORIZED，调用方应立即 return
 */
export function requireScope(
  client: unknown,
  respond: (ok: boolean, data: unknown, err?: unknown) => void,
  requiredScope: string,
): boolean {
  const scopes: string[] = (client as any)?.connect?.scopes ?? [];
  // ADMIN_SCOPE 拥有所有权限
  if (scopes.includes(ADMIN_SCOPE) || scopes.includes(requiredScope)) return true;
  respond(false, undefined, {
    code: "UNAUTHORIZED",
    message: `缺少权限: ${requiredScope}`,
  });
  return false;
}
