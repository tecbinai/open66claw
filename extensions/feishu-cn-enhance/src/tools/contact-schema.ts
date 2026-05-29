import { Type, type Static } from "@sinclair/typebox";

const CONTACT_ACTION_VALUES = [
  "search_user",
  "get_user",
  "list_departments",
  "get_department",
  "department_users",
  "search",
  "batch_get_user",
] as const;

export const FeishuContactSchema = Type.Object({
  action: Type.Unsafe<(typeof CONTACT_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...CONTACT_ACTION_VALUES],
    description:
      "Action: search_user | get_user | list_departments | get_department | department_users | search | batch_get_user",
  }),

  // search_user: by email or mobile
  emails: Type.Optional(
    Type.Array(Type.String(), { description: "Email addresses (for search_user)" }),
  ),
  mobiles: Type.Optional(
    Type.Array(Type.String(), { description: "Mobile numbers (for search_user)" }),
  ),

  // get_user / department_users
  user_id: Type.Optional(Type.String({ description: "User open_id (for get_user)" })),

  // batch_get_user
  user_ids: Type.Optional(
    Type.Array(Type.String(), { description: "User open_ids (for batch_get_user)" }),
  ),

  // department
  department_id: Type.Optional(
    Type.String({ description: "Department ID (for get_department / department_users). Use '0' for root." }),
  ),

  // search (fuzzy)
  query: Type.Optional(Type.String({ description: "Search keyword (for search action)" })),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 20, max 50)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuContactParams = Static<typeof FeishuContactSchema>;
