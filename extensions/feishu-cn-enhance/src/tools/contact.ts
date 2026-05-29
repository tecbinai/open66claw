/**
 * feishu_contact — 通讯录工具
 *
 * Actions: search_user | get_user | list_departments | get_department |
 *          department_users | search | batch_get_user
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuContactSchema, type FeishuContactParams } from "./contact-schema.js";

export function registerFeishuContactTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_contact",
    label: "Feishu Contact (飞书通讯录)",
    description:
      "Feishu contact/directory operations. Actions: search_user, get_user, list_departments, get_department, department_users, search, batch_get_user",
    parameters: FeishuContactSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuContactParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── search_user by email/mobile ───────────────────
          case "search_user": {
            if (!p.emails?.length && !p.mobiles?.length)
              return json({ error: "emails or mobiles required" });
            const res = await client.contact.user.batchGetId({
              data: {
                emails: p.emails,
                mobiles: p.mobiles,
              },
              params: { user_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── get_user ─────────────────────────────────────
          case "get_user": {
            if (!p.user_id) return json({ error: "user_id is required" });
            const res = await client.contact.user.get({
              path: { user_id: p.user_id },
              params: { user_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.user);
          }

          // ── list_departments ──────────────────────────────
          case "list_departments": {
            const deptId = p.department_id ?? "0";
            const res = await client.contact.department.children({
              path: { department_id: deptId },
              params: {
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
                user_id_type: "open_id",
                department_id_type: "open_department_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              departments: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── get_department ────────────────────────────────
          case "get_department": {
            if (!p.department_id) return json({ error: "department_id is required" });
            const res = await client.contact.department.get({
              path: { department_id: p.department_id },
              params: {
                user_id_type: "open_id",
                department_id_type: "open_department_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.department);
          }

          // ── department_users ──────────────────────────────
          case "department_users": {
            if (!p.department_id) return json({ error: "department_id is required" });
            const res = await client.contact.user.findByDepartment({
              params: {
                department_id: p.department_id,
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
                user_id_type: "open_id",
                department_id_type: "open_department_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              users: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── search (fuzzy by keyword) ─────────────────────
          case "search": {
            if (!p.query) return json({ error: "query is required" });
            const res = await client.search.user.create({
              data: { query: p.query },
              params: {
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              users: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── batch_get_user ────────────────────────────────
          case "batch_get_user": {
            if (!p.user_ids?.length) return json({ error: "user_ids array is required" });
            const res = await client.contact.user.batch({
              params: {
                user_ids: p.user_ids,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ users: res.data?.items });
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
