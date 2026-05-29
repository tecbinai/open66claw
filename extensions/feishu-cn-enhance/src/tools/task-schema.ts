import { Type, type Static } from "@sinclair/typebox";

const TASK_ACTION_VALUES = [
  "list",
  "get",
  "create",
  "update",
  "complete",
  "uncomplete",
  "delete",
  "list_comments",
  "add_comment",
] as const;

export const FeishuTaskSchema = Type.Object({
  action: Type.Unsafe<(typeof TASK_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...TASK_ACTION_VALUES],
    description:
      "Action: list | get | create | update | complete | uncomplete | delete | list_comments | add_comment",
  }),
  task_id: Type.Optional(Type.String({ description: "Task ID (for get/update/complete/delete)" })),

  // create / update fields
  summary: Type.Optional(Type.String({ description: "Task title / summary" })),
  description: Type.Optional(Type.String({ description: "Task description (rich text)" })),
  due_time: Type.Optional(
    Type.String({ description: "Due time (Unix timestamp string, e.g. '1710489600')" }),
  ),
  collaborator_ids: Type.Optional(
    Type.Array(Type.String(), { description: "Collaborator open_ids" }),
  ),
  follower_ids: Type.Optional(Type.Array(Type.String(), { description: "Follower open_ids" })),

  // comment
  comment_content: Type.Optional(Type.String({ description: "Comment text (for add_comment)" })),

  // pagination
  page_size: Type.Optional(Type.Number({ description: "Page size (default 50, max 100)" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuTaskParams = Static<typeof FeishuTaskSchema>;
