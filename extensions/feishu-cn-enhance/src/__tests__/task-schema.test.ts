import { describe, it, expect } from "vitest";
import { FeishuTaskSchema } from "../tools/task-schema.js";

describe("FeishuTaskSchema", () => {
  it("has required action property with 9 actions", () => {
    const actions = FeishuTaskSchema.properties.action.enum;
    expect(actions).toHaveLength(9);
    expect(actions).toContain("list");
    expect(actions).toContain("create");
    expect(actions).toContain("complete");
    expect(actions).toContain("uncomplete");
    expect(actions).toContain("delete");
    expect(actions).toContain("add_comment");
  });

  it("has task_id, summary, description fields", () => {
    const props = FeishuTaskSchema.properties;
    expect(props.task_id).toBeDefined();
    expect(props.summary).toBeDefined();
    expect(props.description).toBeDefined();
    expect(props.due_time).toBeDefined();
  });

  it("has collaborator_ids and follower_ids as arrays", () => {
    expect(FeishuTaskSchema.properties.collaborator_ids.type).toBe("array");
    expect(FeishuTaskSchema.properties.follower_ids.type).toBe("array");
  });

  it("has comment_content field", () => {
    expect(FeishuTaskSchema.properties.comment_content).toBeDefined();
  });
});
