import { Type, type Static } from "@sinclair/typebox";

const MESSAGE_ACTION_VALUES = [
  "forward",
  "recall",
  "pin",
  "unpin",
  "list_pins",
  "read_users",
  "get",
  "reply",
] as const;

export const FeishuMessageSchema = Type.Object({
  action: Type.Unsafe<(typeof MESSAGE_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...MESSAGE_ACTION_VALUES],
    description:
      "Action: forward | recall | pin | unpin | list_pins | read_users | get | reply",
  }),

  // message_id — required for most actions
  message_id: Type.Optional(
    Type.String({ description: "Message ID (for forward/recall/pin/unpin/read_users/get/reply)" }),
  ),

  // forward: target chat
  receive_id: Type.Optional(
    Type.String({ description: "Target chat_id or open_id (for forward/reply)" }),
  ),

  // reply: message content
  msg_type: Type.Optional(
    Type.String({ description: 'Message type: "text" | "post" | "interactive" (for reply)' }),
  ),
  content: Type.Optional(
    Type.String({ description: "Message content JSON string (for reply)" }),
  ),

  // list_pins: chat_id
  chat_id: Type.Optional(
    Type.String({ description: "Chat ID (for list_pins)" }),
  ),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 20)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuMessageParams = Static<typeof FeishuMessageSchema>;
