/**
 * feishu-cn-enhance — 飞书 CN 增强插件
 *
 * Extends the upstream @openclaw/feishu channel plugin with additional tools:
 *   - feishu_calendar  — 日历（日程 CRUD、忙闲查询）
 *   - feishu_task      — 任务（TODO CRUD、评论）
 *   - feishu_approval  — 审批（定义/实例/任务查询、发起审批）
 *   - feishu_minutes   — 妙记/会议纪要
 *
 * Design principles:
 *   1. ZERO modifications to extensions/feishu/ (upstream untouched)
 *   2. Shares the same Lark SDK client & token cache via re-import
 *   3. Tools always registered; credentials checked at call time (no restart needed)
 *   4. Safe to uninstall — no residual config or patches
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { registerFeishuApprovalTools } from "./src/tools/approval.js";
import { registerFeishuCalendarTools } from "./src/tools/calendar.js";
import { registerFeishuContactTools } from "./src/tools/contact.js";
import { registerFeishuGroupTools } from "./src/tools/group.js";
import { registerFeishuMessageTools } from "./src/tools/message.js";
import { registerFeishuMinutesTools } from "./src/tools/minutes.js";
import { registerFeishuSheetTools } from "./src/tools/sheet.js";
import { registerFeishuTaskTools } from "./src/tools/task.js";

const plugin = {
  id: "feishu-cn-enhance",
  name: "Feishu CN Enhance",
  description: "飞书增强工具 — 日历/任务/审批/会议纪要/电子表格/通讯录/消息增强/群管理（不侵入上游 feishu 插件）",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.logger.info?.("[feishu-cn-enhance] Registering enhanced Feishu tools…");

    // Register all tool groups
    registerFeishuCalendarTools(api);
    registerFeishuTaskTools(api);
    registerFeishuApprovalTools(api);
    registerFeishuMinutesTools(api);
    registerFeishuSheetTools(api);
    registerFeishuContactTools(api);
    registerFeishuMessageTools(api);
    registerFeishuGroupTools(api);

    api.logger.info?.(
      "[feishu-cn-enhance] Done — 8 tools registered (calendar, task, approval, minutes, sheet, contact, message, group)",
    );
  },
};

export default plugin;
