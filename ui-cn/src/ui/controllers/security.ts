/**
 * Security Mode Controller
 * 安全模式控制器 - 管理 AI 能力范围配置
 */

import type { GatewayBrowserClient } from "../gateway";

/**
 * 安全模式类型
 */
export type SecurityMode = "trust" | "standard" | "full";

/**
 * 安全模式功能项
 */
export interface SecurityFeature {
  text: string;
  type: "positive" | "neutral" | "warning" | "danger";
}

/**
 * 安全模式信息
 */
export interface SecurityModeInfo {
  id: SecurityMode;
  name: string;
  description: string;
  icon: string;
  recommended?: boolean;
  dangerous?: boolean;
  features: SecurityFeature[];
}

/**
 * 安全模式 API 响应
 */
export interface SecurityModesResponse {
  modes: SecurityModeInfo[];
  current: SecurityMode;
}

/**
 * 安全模式状态
 */
export interface SecurityState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  securityLoading: boolean;
  securityModes: SecurityModeInfo[];
  securityCurrent: SecurityMode | null;
  securitySaving: boolean;
  securityError: string | null;
}

/**
 * 获取安全模式列表和当前模式
 */
export async function loadSecurityModes(state: SecurityState): Promise<void> {
  console.log("[security] loadSecurityModes called:", {
    hasClient: !!state.client,
    connected: state.connected,
  });

  if (!state.client || !state.connected) {
    console.warn("[security] Cannot load security modes: not connected");
    return;
  }

  state.securityLoading = true;
  state.securityError = null;

  try {
    console.log("[security] Requesting security.modes...");
    const res = (await state.client.request("security.modes", {})) as SecurityModesResponse;
    console.log("[security] security.modes response:", res);
    state.securityModes = res.modes ?? [];
    state.securityCurrent = res.current ?? null;
  } catch (err) {
    console.error("[security] security.modes error:", err);
    state.securityError = String(err);
  } finally {
    state.securityLoading = false;
  }
}

/**
 * 设置安全模式
 * @param mode 目标安全模式
 * @param confirmed 是否已确认（trust 模式需要确认）
 */
export async function setSecurityMode(
  state: SecurityState,
  mode: SecurityMode,
  confirmed: boolean = false,
): Promise<{ ok: boolean; needsConfirmation?: boolean }> {
  console.log("[security] setSecurityMode called:", {
    mode,
    confirmed,
    hasClient: !!state.client,
    connected: state.connected,
  });

  if (!state.client || !state.connected) {
    console.warn("[security] Cannot set security mode: not connected", {
      hasClient: !!state.client,
      connected: state.connected,
    });
    return { ok: false };
  }

  state.securitySaving = true;
  state.securityError = null;

  try {
    console.log("[security] Sending security.setMode request...");
    const res = (await state.client.request("security.setMode", {
      mode,
      confirmed,
    })) as { ok: boolean; mode?: SecurityMode };
    console.log("[security] security.setMode response:", res);

    if (res.ok && res.mode) {
      state.securityCurrent = res.mode;
      return { ok: true };
    }
    return { ok: false };
  } catch (err) {
    const errorMsg = String(err);
    console.error("[security] security.setMode error:", errorMsg);
    // 检查是否需要确认
    if (errorMsg.includes("requires confirmation")) {
      return { ok: false, needsConfirmation: true };
    }
    state.securityError = errorMsg;
    return { ok: false };
  } finally {
    state.securitySaving = false;
  }
}

/**
 * 获取安全模式显示名称
 */
export function getSecurityModeName(modes: SecurityModeInfo[], modeId: SecurityMode): string {
  const mode = modes.find((m) => m.id === modeId);
  return mode?.name ?? modeId;
}

/**
 * 获取安全模式图标
 */
export function getSecurityModeIcon(modes: SecurityModeInfo[], modeId: SecurityMode): string {
  const mode = modes.find((m) => m.id === modeId);
  return mode?.icon ?? "🔒";
}

/**
 * 判断模式是否危险（需要确认）
 */
export function isSecurityModeDangerous(modes: SecurityModeInfo[], modeId: SecurityMode): boolean {
  const mode = modes.find((m) => m.id === modeId);
  return mode?.dangerous ?? false;
}
