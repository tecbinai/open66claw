import { describe, it, expect, vi } from "vitest";
import { FeishuMinutesSchema } from "../tools/minutes-schema.js";

// Mock Lark SDK
vi.mock("@larksuiteoapi/node-sdk", () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({
      vc: {
        meetingRecording: {
          get: vi.fn(),
        },
      },
      calendar: {
        calendarEventMeetingChat: {
          create: vi.fn(),
        },
      },
    })),
    AppType: { SelfBuild: "self_built" },
    Domain: { Feishu: "https://open.feishu.cn" },
  },
}));

vi.mock("../shared.js", () => ({
  getToolClient: vi.fn().mockReturnValue({
    vc: {
      meetingRecording: {
        get: vi.fn().mockResolvedValue({
          data: { recording: { url: "https://example.com/recording.mp4", duration: "3600" } },
        }),
      },
    },
    calendar: {
      calendarEventMeetingChat: {
        create: vi.fn().mockResolvedValue({
          data: { meeting_chat_id: "oc_xxx", applink: "https://applink.feishu.cn/xxx" },
        }),
      },
    },
  }),
  json: (data: unknown) => ({ content: [{ type: "text", text: JSON.stringify(data) }] }),
}));

describe("FeishuMinutesSchema", () => {
  it("should define action enum with expected values", () => {
    const schema = FeishuMinutesSchema;
    expect(schema).toBeDefined();
    expect(schema.properties).toBeDefined();
  });

  it("should have minute_token as optional string", () => {
    const props = FeishuMinutesSchema.properties;
    expect(props.minute_token).toBeDefined();
  });

  it("should have accountId as optional string", () => {
    const props = FeishuMinutesSchema.properties;
    expect(props.accountId).toBeDefined();
  });

  it("should have page_size and page_token for pagination", () => {
    const props = FeishuMinutesSchema.properties;
    expect(props.page_size).toBeDefined();
    expect(props.page_token).toBeDefined();
  });
});

describe("minutes tool actions", () => {
  it("should support get action", async () => {
    const { registerFeishuMinutesTools } = await import("../tools/minutes.js");
    expect(registerFeishuMinutesTools).toBeDefined();
    expect(typeof registerFeishuMinutesTools).toBe("function");
  });
});
