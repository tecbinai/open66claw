import { Type, type Static } from "@sinclair/typebox";

const MINUTES_ACTION_VALUES = ["get", "list_statistics"] as const;

export const FeishuMinutesSchema = Type.Object({
  action: Type.Unsafe<(typeof MINUTES_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...MINUTES_ACTION_VALUES],
    description: "Action: get | list_statistics",
  }),

  minute_token: Type.Optional(
    Type.String({ description: "Meeting minute token (from URL or event)" }),
  ),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 20, max 50)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuMinutesParams = Static<typeof FeishuMinutesSchema>;
