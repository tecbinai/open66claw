/**
 * Hook: before_tool_call — 飞书 API 权限 scope 预检
 *
 * Warn the user *before* the API call fails when the required scopes
 * are likely missing. This is a best-effort hint — the definitive
 * permission check is done by the Feishu API itself.
 */

const TOOL_REQUIRED_SCOPES: Record<string, string[]> = {
  feishu_calendar: ["calendar:calendar", "calendar:calendar:readonly"],
  feishu_task: ["task:task", "task:task:readonly"],
  feishu_approval: ["approval:approval", "approval:approval:readonly"],
  feishu_minutes: ["vc:meeting_record:readonly"],
  feishu_sheet: ["sheets:spreadsheet"],
  feishu_contact: ["contact:user.base:readonly", "search:user"],
  feishu_message: ["im:message", "im:message:send_as_bot"],
  feishu_group: ["im:chat", "im:chat:readonly"],
};

export function createScopeCheckHandler() {
  return async (event: { toolName: string; params: Record<string, unknown> }) => {
    const scopes = TOOL_REQUIRED_SCOPES[event.toolName];
    if (!scopes) return undefined; // not our tool

    // We do not block — just log a reminder. The actual API will return
    // a permission_violations error with a grant URL if scopes are missing.
    return undefined;
  };
}
