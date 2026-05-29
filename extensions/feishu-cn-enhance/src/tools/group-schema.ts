import { Type, type Static } from "@sinclair/typebox";

const GROUP_ACTION_VALUES = [
  "create",
  "update",
  "dissolve",
  "add_members",
  "remove_members",
  "list_members",
  "info",
  "list",
  "search",
] as const;

export const FeishuGroupSchema = Type.Object({
  action: Type.Unsafe<(typeof GROUP_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...GROUP_ACTION_VALUES],
    description:
      "Action: create | update | dissolve | add_members | remove_members | list_members | info | list | search",
  }),

  // chat_id — required for most actions
  chat_id: Type.Optional(
    Type.String({ description: "Chat (group) ID" }),
  ),

  // create / update fields
  name: Type.Optional(Type.String({ description: "Group name (for create/update)" })),
  description: Type.Optional(Type.String({ description: "Group description (for create/update)" })),
  chat_mode: Type.Optional(
    Type.String({ description: '"group" (default) or "topic" (for create)' }),
  ),
  chat_type: Type.Optional(
    Type.String({ description: '"private" (default) or "public" (for create)' }),
  ),

  // add/remove members
  id_list: Type.Optional(
    Type.Array(Type.String(), {
      description: "User open_ids to add/remove",
    }),
  ),

  // search
  query: Type.Optional(Type.String({ description: "Search keyword (for search)" })),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 20, max 100)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuGroupParams = Static<typeof FeishuGroupSchema>;
