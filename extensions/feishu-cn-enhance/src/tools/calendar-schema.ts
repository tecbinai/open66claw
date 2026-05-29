import { Type, type Static } from "@sinclair/typebox";

const CALENDAR_ACTION_VALUES = [
  "list_calendars",
  "list_events",
  "get_event",
  "create_event",
  "update_event",
  "delete_event",
  "search_events",
  "freebusy",
] as const;

export const FeishuCalendarSchema = Type.Object({
  action: Type.Unsafe<(typeof CALENDAR_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...CALENDAR_ACTION_VALUES],
    description:
      "Action: list_calendars | list_events | get_event | create_event | update_event | delete_event | search_events | freebusy",
  }),
  calendar_id: Type.Optional(
    Type.String({
      description:
        'Calendar ID. Use "primary" for the default calendar. Required for most actions.',
    }),
  ),
  event_id: Type.Optional(Type.String({ description: "Event ID (for get/update/delete)" })),

  // create / update fields
  summary: Type.Optional(Type.String({ description: "Event title" })),
  description: Type.Optional(Type.String({ description: "Event description" })),
  start_time: Type.Optional(
    Type.String({ description: "Start time (RFC3339, e.g. 2026-03-15T09:00:00+08:00)" }),
  ),
  end_time: Type.Optional(
    Type.String({ description: "End time (RFC3339, e.g. 2026-03-15T10:00:00+08:00)" }),
  ),
  timezone: Type.Optional(Type.String({ description: "Timezone (default: Asia/Shanghai)" })),
  location: Type.Optional(Type.String({ description: "Event location" })),
  attendee_ids: Type.Optional(
    Type.Array(Type.String(), { description: "Attendee open_ids to invite" }),
  ),

  // search
  query: Type.Optional(Type.String({ description: "Search keyword (for search_events)" })),

  // freebusy
  user_ids: Type.Optional(
    Type.Array(Type.String(), { description: "User open_ids (for freebusy query)" }),
  ),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 50, max 100)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuCalendarParams = Static<typeof FeishuCalendarSchema>;
