/**
 * feishu_message — 消息增强工具
 *
 * Actions: forward | recall | pin | unpin | list_pins | read_users | get | reply
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuMessageSchema, type FeishuMessageParams } from "./message-schema.js";

export function registerFeishuMessageTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_message",
    label: "Feishu Message (飞书消息增强)",
    description:
      "Feishu message operations. Actions: forward, recall, pin, unpin, list_pins, read_users, get, reply",
    parameters: FeishuMessageSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuMessageParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── forward ──────────────────────────────────────
          case "forward": {
            if (!p.message_id) return json({ error: "message_id is required" });
            if (!p.receive_id) return json({ error: "receive_id is required" });
            const res = await client.im.message.forward({
              path: { message_id: p.message_id },
              data: { receive_id: p.receive_id },
              params: { receive_id_type: "chat_id" },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── recall (delete) ──────────────────────────────
          case "recall": {
            if (!p.message_id) return json({ error: "message_id is required" });
            const res = await client.im.message.delete({
              path: { message_id: p.message_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ recalled: true, message_id: p.message_id });
          }

          // ── pin ──────────────────────────────────────────
          case "pin": {
            if (!p.message_id) return json({ error: "message_id is required" });
            const res = await client.im.pin.create({
              data: { message_id: p.message_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.pin);
          }

          // ── unpin ────────────────────────────────────────
          case "unpin": {
            if (!p.message_id) return json({ error: "message_id is required" });
            const res = await client.im.pin.delete({
              data: { message_id: p.message_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ unpinned: true, message_id: p.message_id });
          }

          // ── list_pins ────────────────────────────────────
          case "list_pins": {
            if (!p.chat_id) return json({ error: "chat_id is required" });
            const res = await client.im.pin.list({
              params: {
                chat_id: p.chat_id,
                page_size: String(p.page_size ?? 20),
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              pins: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── read_users ───────────────────────────────────
          case "read_users": {
            if (!p.message_id) return json({ error: "message_id is required" });
            const res = await client.im.message.readUsers({
              path: { message_id: p.message_id },
              params: {
                user_id_type: "open_id",
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              read_users: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── get ──────────────────────────────────────────
          case "get": {
            if (!p.message_id) return json({ error: "message_id is required" });
            const res = await client.im.message.get({
              path: { message_id: p.message_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data);
          }

          // ── reply ────────────────────────────────────────
          case "reply": {
            if (!p.message_id) return json({ error: "message_id is required" });
            if (!p.msg_type) return json({ error: "msg_type is required" });
            if (!p.content) return json({ error: "content is required" });
            const res = await client.im.message.reply({
              path: { message_id: p.message_id },
              data: {
                msg_type: p.msg_type,
                content: p.content,
              },
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
