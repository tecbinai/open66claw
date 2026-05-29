/**
 * feishu_approval — 审批流工具
 *
 * Actions: get_definition | list_instances | get_instance | create_instance |
 *          search_tasks | list_comments | add_comment
 *
 * Uses Feishu Approval v4 API via @larksuiteoapi/node-sdk.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuApprovalSchema, type FeishuApprovalParams } from "./approval-schema.js";

export function registerFeishuApprovalTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_approval",
    label: "Feishu Approval (飞书审批)",
    description:
      "Feishu approval operations. Actions: get_definition, list_instances, get_instance, create_instance, search_tasks, list_comments, add_comment",
    parameters: FeishuApprovalSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuApprovalParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── get approval definition ─────────────────────
          case "get_definition": {
            if (!p.approval_code) return json({ error: "approval_code is required" });
            const res = await client.approval.approval.get({
              params: { locale: "zh-CN" },
              path: { approval_code: p.approval_code },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── list/query instances of an approval ──────────
          case "list_instances": {
            if (!p.approval_code) return json({ error: "approval_code is required" });
            const res = await client.approval.instance.query({
              data: {
                approval_code: p.approval_code,
              },
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              count: res.data?.count,
              instances: res.data?.instance_list,
              page_token: (res as any).data?.page_token,
            });
          }

          // ── get single instance ─────────────────────────
          case "get_instance": {
            if (!p.instance_id) return json({ error: "instance_id is required" });
            const res = await client.approval.instance.get({
              params: { locale: "zh-CN" },
              path: { instance_id: p.instance_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── create instance ─────────────────────────────
          case "create_instance": {
            if (!p.approval_code) return json({ error: "approval_code is required" });
            if (!p.open_id) return json({ error: "open_id is required (initiator)" });
            if (!p.form_values) return json({ error: "form_values JSON string is required" });
            const res = await client.approval.instance.create({
              data: {
                approval_code: p.approval_code,
                open_id: p.open_id,
                form: p.form_values,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ instance_code: res.data?.instance_code });
          }

          // ── search my approval tasks ────────────────────
          case "search_tasks": {
            const res = await client.approval.task.search({
              data: {
                user_id: p.user_id ?? "",
                approval_code: p.approval_code,
                instance_status: p.task_status,
              },
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              tasks: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── list comments on instance ───────────────────
          case "list_comments": {
            if (!p.instance_id) return json({ error: "instance_id is required" });
            const res = await client.approval.instanceComment.list({
              params: {
                instance_id: p.instance_id,
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              comments: res.data?.comment_list,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── add comment to instance ─────────────────────
          case "add_comment": {
            if (!p.instance_id) return json({ error: "instance_id is required" });
            if (!p.comment_content) return json({ error: "comment_content is required" });
            const res = await client.approval.instanceComment.create({
              params: {
                user_id_type: "open_id",
              },
              path: { instance_id: p.instance_id },
              data: { content: p.comment_content },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          default:
            return json({ error: `Unknown action: ${String(p.action)}` });
        }
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  });
}
