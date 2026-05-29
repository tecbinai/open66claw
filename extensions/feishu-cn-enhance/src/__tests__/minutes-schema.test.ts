import { describe, it, expect } from "vitest";
import { FeishuMinutesSchema } from "../tools/minutes-schema.js";

describe("FeishuMinutesSchema", () => {
  it("has required action property with 2 actions", () => {
    const actions = FeishuMinutesSchema.properties.action.enum;
    expect(actions).toHaveLength(2);
    expect(actions).toContain("get");
    expect(actions).toContain("list_statistics");
  });

  it("has minute_token field", () => {
    expect(FeishuMinutesSchema.properties.minute_token).toBeDefined();
  });

  it("has pagination and accountId fields", () => {
    const props = FeishuMinutesSchema.properties;
    expect(props.page_size).toBeDefined();
    expect(props.page_token).toBeDefined();
    expect(props.accountId).toBeDefined();
  });
});
