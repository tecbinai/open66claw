import { toNumber } from "../format";
import type { GatewayBrowserClient } from "../gateway";
import type { SessionsListResult } from "../types";

export type SessionsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
};

export async function loadSessions(
  state: SessionsState,
  opts?: { activeMinutes?: number; force?: boolean },
) {
  if (!state.client || !state.connected) return;
  if (state.sessionsLoading) return;
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const params: Record<string, unknown> = {
      includeGlobal: state.sessionsIncludeGlobal,
      includeUnknown: state.sessionsIncludeUnknown,
      includeDerivedTitles: true,
      includeLastMessage: true,
    };
    const activeMinutes = toNumber(state.sessionsFilterActive, 0);
    const limit = toNumber(state.sessionsFilterLimit, 0);
    if (activeMinutes > 0) params.activeMinutes = activeMinutes;
    if (limit > 0) params.limit = limit;
    const res = (await state.client.request("sessions.list", params)) as
      | SessionsListResult
      | undefined;
    if (res) state.sessionsResult = res;
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}

export async function patchSession(
  state: SessionsState,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
  },
) {
  if (!state.client || !state.connected) return;
  const params: Record<string, unknown> = { key };
  if ("label" in patch) params.label = patch.label;
  if ("thinkingLevel" in patch) params.thinkingLevel = patch.thinkingLevel;
  if ("verboseLevel" in patch) params.verboseLevel = patch.verboseLevel;
  if ("reasoningLevel" in patch) params.reasoningLevel = patch.reasoningLevel;
  try {
    await state.client.request("sessions.patch", params);
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}

export async function deleteSession(state: SessionsState, key: string) {
  if (!state.client || !state.connected) return;
  if (state.sessionsLoading) return;
  const mainKey = state.sessionsResult?.mainKey;
  if (mainKey && key === mainKey) {
    window.alert("主会话不可删除。如需清空对话内容，请使用「重置会话」功能。");
    return;
  }
  const confirmed = window.confirm(
    `确定要删除此会话吗？\n\n` +
      `会话密钥：${key}\n\n` +
      `删除后 AI 会彻底忘掉和这个用户聊过的所有内容。\n` +
      `用户下次发消息会自动开始全新对话。\n` +
      `不会影响其他用户，也不会删除账号。`,
  );
  if (!confirmed) return;
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    await state.client.request("sessions.delete", { key, deleteTranscript: true });
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}
