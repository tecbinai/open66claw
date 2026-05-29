/**
 * feishu_calendar — 日历工具
 *
 * Actions: list_calendars | list_events | get_event | create_event |
 *          update_event | delete_event | search_events | freebusy
 *
 * Re-uses upstream feishu plugin's client (shared OAuth token).
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuCalendarSchema, type FeishuCalendarParams } from "./calendar-schema.js";

const DEFAULT_TZ = "Asia/Shanghai";

export function registerFeishuCalendarTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_calendar",
    label: "Feishu Calendar (飞书日历)",
    description:
      "Feishu calendar operations. Actions: list_calendars, list_events, get_event, create_event, update_event, delete_event, search_events, freebusy",
    parameters: FeishuCalendarSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuCalendarParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── list calendars ──────────────────────────────
          case "list_calendars": {
            const res = await client.calendar.calendar.list({
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              calendars: res.data?.calendar_list,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── list events ─────────────────────────────────
          case "list_events": {
            if (!p.calendar_id) return json({ error: "calendar_id is required" });
            const res = await client.calendar.calendarEvent.list({
              path: { calendar_id: p.calendar_id },
              params: {
                page_size: p.page_size ?? 50,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              events: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── get single event ────────────────────────────
          case "get_event": {
            if (!p.calendar_id || !p.event_id)
              return json({ error: "calendar_id and event_id are required" });
            const res = await client.calendar.calendarEvent.get({
              path: { calendar_id: p.calendar_id, event_id: p.event_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.event);
          }

          // ── create event ────────────────────────────────
          case "create_event": {
            if (!p.calendar_id) return json({ error: "calendar_id is required" });
            if (!p.summary) return json({ error: "summary is required" });
            if (!p.start_time || !p.end_time)
              return json({ error: "start_time and end_time are required" });

            const tz = p.timezone ?? DEFAULT_TZ;
            const res = await client.calendar.calendarEvent.create({
              path: { calendar_id: p.calendar_id },
              data: {
                summary: p.summary,
                description: p.description,
                start_time: { timestamp: p.start_time, timezone: tz },
                end_time: { timestamp: p.end_time, timezone: tz },
                ...(p.location ? { location: { name: p.location } } : {}),
              },
            });
            if (res.code !== 0) throw new Error(res.msg);

            const eventId = res.data?.event?.event_id;

            // add attendees if specified
            if (eventId && p.attendee_ids?.length) {
              await client.calendar.calendarEventAttendee.create({
                path: { calendar_id: p.calendar_id, event_id: eventId },
                data: {
                  attendees: p.attendee_ids.map((id) => ({
                    type: "user",
                    user_id: id,
                  })),
                },
                params: { user_id_type: "open_id" },
              });
            }
            return json(res.data?.event);
          }

          // ── update event ────────────────────────────────
          case "update_event": {
            if (!p.calendar_id || !p.event_id)
              return json({ error: "calendar_id and event_id are required" });

            const tz = p.timezone ?? DEFAULT_TZ;
            const data: Record<string, unknown> = {};
            if (p.summary !== undefined) data.summary = p.summary;
            if (p.description !== undefined) data.description = p.description;
            if (p.start_time) data.start_time = { timestamp: p.start_time, timezone: tz };
            if (p.end_time) data.end_time = { timestamp: p.end_time, timezone: tz };
            if (p.location) data.location = { name: p.location };

            const res = await client.calendar.calendarEvent.patch({
              path: { calendar_id: p.calendar_id, event_id: p.event_id },
              data: data as any,
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json(res.data?.event);
          }

          // ── delete event ────────────────────────────────
          case "delete_event": {
            if (!p.calendar_id || !p.event_id)
              return json({ error: "calendar_id and event_id are required" });
            const res = await client.calendar.calendarEvent.delete({
              path: { calendar_id: p.calendar_id, event_id: p.event_id },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({ deleted: true, event_id: p.event_id });
          }

          // ── search events ───────────────────────────────
          case "search_events": {
            if (!p.calendar_id) return json({ error: "calendar_id is required" });
            if (!p.query) return json({ error: "query is required for search" });
            const res = await client.calendar.calendarEvent.search({
              path: { calendar_id: p.calendar_id },
              data: { query: p.query },
              params: {
                page_size: p.page_size ?? 20,
                page_token: p.page_token,
              },
            });
            if (res.code !== 0) throw new Error(res.msg);
            return json({
              events: res.data?.items,
              has_more: res.data?.has_more,
              page_token: res.data?.page_token,
            });
          }

          // ── freebusy ────────────────────────────────────
          case "freebusy": {
            if (!p.start_time || !p.end_time)
              return json({ error: "start_time and end_time are required" });
            if (!p.user_ids?.length) return json({ error: "user_ids are required" });
            const res = await client.calendar.freebusy.list({
              data: {
                time_min: p.start_time,
                time_max: p.end_time,
                user_id: p.user_ids[0],
              },
              params: { user_id_type: "open_id" },
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
