/**
 * feishu_group — 群管理工具
 *
 * Actions: create | update | dissolve | add_members | remove_members |
 *          list_members | info | list | search
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuGroupSchema, type FeishuGroupParams } from "./group-schema.js";

export function registerFeishuGroupTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_group",
    label: "Feishu Group (飞书群管理)",
    description:
      "Feishu group (chat) management. Actions: create, update, dissolve, add_members, remove_members, list_members, info, list, search",
    parameters: FeishuGroupSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuGroupParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── create ───────────────────────────────────────
          case "create": {
            if (!p.name) return json({ error: "name is required" });
            const res = await client.im.chat.create({
              data: {
                name: p.name,
                description: p.description,
                chat_mode: p.chat_mode ?? "group",
                chat_type: p.chat_type ?? "private",
              },
              params: { user_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── update ───────────────────────────────────────
          case "update": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            const data: Record<string, unknown> = {};
            if (p.name !== undefined) data.name = p.name;
            if (p.description !== undefined) data.description = p.description;
            const res = await client.im.chat.update({
              path: { chat_id: p.chat_id },
              data: data as any,
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ updated: true, chat_id: p.chat_id });
          }

          // ── dissolve ─────────────────────────────────────
          case "dissolve": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            const res = await client.im.chat.delete({
              path: { chat_id: p.chat_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ dissolved: true, chat_id: p.chat_id });
          }

          // ── add_members ──────────────────────────────────
          case "add_members": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            if (!p.id_list?.length) return json({ error: "id_list is required" });
            const res = await client.im.chatMembers.create({
              path: { chat_id: p.chat_id },
              data: { id_list: p.id_list },
              params: { member_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── remove_members ───────────────────────────────
          case "remove_members": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            if (!p.id_list?.length) return json({ error: "id_list is required" });
            const res = await client.im.chatMembers.delete({
              path: { chat_id: p.chat_id },
              data: { id_list: p.id_list },
              params: { member_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── list_members ─────────────────────────────────
          case "list_members": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            const res = await client.im.chatMembers.get({
              path: { chat_id: p.chat_id },
              params: {
                member_id_type: "open_id",
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              members: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── info ─────────────────────────────────────────
          case "info": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            const res = await client.im.chat.get({
              path: { chat_id: p.chat_id },
              params: { user_id_type: "open_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── list (bot's chats) ───────────────────────────
          case "list": {
            const res = await client.im.chat.list({
              params: {
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              chats: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── search ───────────────────────────────────────
          case "search": {
            if (!p.query) return json({ error: "query is required" });
            const res = await client.im.chat.search({
              params: {
                query: p.query,
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
                user_id_type: "open_id",
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              chats: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
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
