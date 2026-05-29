/**
 * feishu_task — 任务/TODO 工具
 *
 * Actions: list | get | create | update | complete | uncomplete | delete |
 *          list_comments | add_comment
 *
 * Uses Feishu Task v1 API via @larksuiteoapi/node-sdk.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuTaskSchema, type FeishuTaskParams } from "./task-schema.js";

export function registerFeishuTaskTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_task",
    label: "Feishu Task (飞书任务)",
    description:
      "Feishu task (TODO) operations. Actions: list, get, create, update, complete, uncomplete, delete, list_comments, add_comment",
    parameters: FeishuTaskSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuTaskParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── list tasks ──────────────────────────────────
          case "list": {
            const res = await client.task.task.list({
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              tasks: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── get task ────────────────────────────────────
          case "get": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const res = await client.task.task.get({
              path: { task_id: p.task_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.task);
          }

          // ── create task ─────────────────────────────────
          case "create": {
            if (!p.summary) return json({ error: "summary is required" });
            const data: Record<string, unknown> = {
              summary: p.summary,
            };
            if (p.description) data.description = p.description;
            if (p.due_time) data.due = { time: p.due_time, is_all_day: false };
            if (p.collaborator_ids) {
              data.collaborator_ids = p.collaborator_ids;
            }
            if (p.follower_ids) {
              data.follower_ids = p.follower_ids;
            }
            // origin is required by Feishu Task v1 API
            data.origin = {
              platform_i18n_name: '{"zh_cn":"OpenClaw","en_us":"OpenClaw"}',
            };

            const res = await client.task.task.create({
              data: data as any,
              params: { user_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.task);
          }

          // ── update task ─────────────────────────────────
          case "update": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const data: Record<string, unknown> = {};
            if (p.summary !== undefined) data.summary = p.summary;
            if (p.description !== undefined) data.description = p.description;
            if (p.due_time) data.due = { time: p.due_time, is_all_day: false };

            const res = await client.task.task.patch({
              path: { task_id: p.task_id },
              data: { task: data as any, update_fields: Object.keys(data) },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.task);
          }

          // ── complete task ───────────────────────────────
          case "complete": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const res = await client.task.task.patch({
              path: { task_id: p.task_id },
              data: {
                task: { completed_at: String(Math.floor(Date.now() / 1000)) } as any,
                update_fields: ["completed_at"],
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ completed: true, task_id: p.task_id });
          }

          // ── uncomplete task ─────────────────────────────
          case "uncomplete": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const res = await client.task.task.patch({
              path: { task_id: p.task_id },
              data: {
                task: { completed_at: "0" } as any,
                update_fields: ["completed_at"],
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ uncompleted: true, task_id: p.task_id });
          }

          // ── delete task ─────────────────────────────────
          case "delete": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const res = await client.task.task.delete({
              path: { task_id: p.task_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ deleted: true, task_id: p.task_id });
          }

          // ── list comments ───────────────────────────────
          case "list_comments": {
            if (!p.task_id) return json({ error: "task_id is required" });
            const res = await client.task.taskComment.list({
              path: { task_id: p.task_id },
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              comments: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── add comment ─────────────────────────────────
          case "add_comment": {
            if (!p.task_id) return json({ error: "task_id is required" });
            if (!p.comment_content) return json({ error: "comment_content is required" });
            const res = await client.task.taskComment.create({
              path: { task_id: p.task_id },
              data: { content: p.comment_content },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.comment);
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
