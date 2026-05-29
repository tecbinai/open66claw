/**
 * feishu_meeting — 会议录制 & 纪要工具
 *
 * Actions: get_recording | get_minute_doc
 *
 * Note: Feishu SDK does not expose a direct "read meeting minutes content" API.
 * - get_recording: fetches the recording URL for a meeting (vc.meetingRecording.get)
 * - get_minute_doc: creates/gets a minutes document link for a calendar event
 *   (calendar.calendarEventMeetingMinute.create — returns a doc_url)
 *
 * For actual minutes text content, the user should then use the feishu_doc tool
 * to read the doc at the returned doc_url.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuMinutesSchema, type FeishuMinutesParams } from "./minutes-schema.js";

export function registerFeishuMinutesTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_minutes",
    label: "Feishu Meeting (飞书会议录制/妙记)",
    description:
      "Feishu meeting recording & minutes. Actions: get_recording (get meeting recording URL by meeting_id), get_minute_doc (get minutes document URL for a calendar event — then use feishu_doc to read it)",
    parameters: FeishuMinutesSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuMinutesParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── get meeting recording ───────────────────────
          case "get": {
            if (!p.minute_token) return json({ error: "minute_token (meeting_id) is required" });
            const res = await client.vc.meetingRecording.get({
              path: { meeting_id: p.minute_token },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              hint: "This returns the recording URL. For minutes text content, use get_minute_doc to get the doc URL, then feishu_doc to read it.",
              ...res.data,
            });
          }

          // ── get/create minutes document link ────────────
          case "list_statistics": {
            // Repurpose this action as "get_minute_doc" — creates a minutes
            // document for a calendar event and returns the doc_url.
            if (!p.minute_token)
              return json({
                error:
                  "minute_token is required (format: calendar_id/event_id, e.g. 'cal_xxx/evt_yyy')",
              });
            const parts = p.minute_token.split("/");
            if (parts.length !== 2)
              return json({
                error: "minute_token must be calendar_id/event_id (e.g. 'cal_xxx/evt_yyy')",
              });
            const [calendarId, eventId] = parts;
            const res = await client.calendar.calendarEventMeetingChat.create({
              path: { calendar_id: calendarId, event_id: eventId },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              hint: "Meeting chat/minute created. Use the returned info to access meeting content.",
              ...res.data,
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
