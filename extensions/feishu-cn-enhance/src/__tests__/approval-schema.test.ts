import { describe, it, expect } from "vitest";
import { FeishuApprovalSchema } from "../tools/approval-schema.js";

describe("FeishuApprovalSchema", () => {
  it("has required action property with 7 actions", () => {
    const actions = FeishuApprovalSchema.properties.action.enum;
    expect(actions).toHaveLength(7);
    expect(actions).toContain("get_definition");
    expect(actions).toContain("create_instance");
    expect(actions).toContain("search_tasks");
    expect(actions).toContain("list_comments");
    expect(actions).toContain("add_comment");
  });

  it("has approval_code and instance_id fields", () => {
    const props = FeishuApprovalSchema.properties;
    expect(props.approval_code).toBeDefined();
    expect(props.instance_id).toBeDefined();
  });

  it("has create_instance fields", () => {
    const props = FeishuApprovalSchema.properties;
    expect(props.form_values).toBeDefined();
    expect(props.open_id).toBeDefined();
  });

  it("has search_tasks filter fields", () => {
    const props = FeishuApprovalSchema.properties;
    expect(props.user_id).toBeDefined();
    expect(props.task_status).toBeDefined();
  });
});
