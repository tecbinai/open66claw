/**
 * Hook: before_prompt_build — 飞书上下文注入
 *
 * When the conversation is happening over Feishu, inject hints about
 * the enhanced tools (calendar / task / approval / minutes) so the
 * LLM knows they are available.
 */

export function createFeishuContextInjectHandler() {
  const TOOL_HINTS = [
    "- 飞书日历 (feishu_calendar): 查询/创建/搜索/删除日程，查忙闲状态",
    "- 飞书任务 (feishu_task): 创建/查询/完成/删除 TODO 任务，评论",
    "- 飞书审批 (feishu_approval): 查看审批定义、发起审批、查看审批任务和评论",
    "- 飞书妙记 (feishu_minutes): 获取会议纪要/录制详情",
    "- 飞书电子表格 (feishu_sheet): 读写单元格、创建表格、追加数据、格式化、增删行/工作表",
    "- 飞书通讯录 (feishu_contact): 按邮箱/手机/姓名搜索用户、查部门、获取用户详情",
    "- 飞书消息增强 (feishu_message): 转发/撤回/置顶消息、查已读、获取消息详情、回复消息",
    "- 飞书群管理 (feishu_group): 创建/解散群、增删成员、查群列表/详情、搜索群",
  ].join("\n");

  return async (event: { systemPromptParts?: string[] }) => {
    // Append tool hints to system prompt so the LLM knows about enhanced tools.
    if (event.systemPromptParts && Array.isArray(event.systemPromptParts)) {
      event.systemPromptParts.push(
        `\n## 飞书增强工具（由 feishu-cn-enhance 插件提供）\n${TOOL_HINTS}`,
      );
    }
    return undefined; // do not block
  };
}
