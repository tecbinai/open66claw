import { Type, type Static } from "@sinclair/typebox";

const APPROVAL_ACTION_VALUES = [
  "get_definition",
  "list_instances",
  "get_instance",
  "create_instance",
  "search_tasks",
  "list_comments",
  "add_comment",
] as const;

export const FeishuApprovalSchema = Type.Object({
  action: Type.Unsafe<(typeof APPROVAL_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...APPROVAL_ACTION_VALUES],
    description:
      "Action: get_definition | list_instances | get_instance | create_instance | search_tasks | list_comments | add_comment",
  }),

  // identifiers
  approval_code: Type.Optional(
    Type.String({
      description:
        "Approval definition code (for get_definition / create_instance / list_instances)",
    }),
  ),
  instance_id: Type.Optional(
    Type.String({
      description: "Approval instance ID (for get_instance / list_comments / add_comment)",
    }),
  ),

  // create_instance fields
  form_values: Type.Optional(
    Type.String({
      description:
        'Form data JSON string (for create_instance), e.g. [{"id":"widget1","type":"input","value":"hello"}]',
    }),
  ),
  open_id: Type.Optional(Type.String({ description: "Initiator open_id (for create_instance)" })),

  // search_tasks filter
  user_id: Type.Optional(
    Type.String({ description: "User open_id (for search_tasks — whose tasks)" }),
  ),
  task_status: Type.Optional(
    Type.String({
      description:
        'Task status filter: "PENDING" | "APPROVED" | "REJECTED" | "TRANSFERRED" | "DONE"',
    }),
  ),

  // comment
  comment_content: Type.Optional(Type.String({ description: "Comment text (for add_comment)" })),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 50, max 100)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuApprovalParams = Static<typeof FeishuApprovalSchema>;
