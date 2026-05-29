import { describe, it, expect } from "vitest";
import { FeishuCalendarSchema } from "../tools/calendar-schema.js";

describe("FeishuCalendarSchema", () => {
  it("has required action property", () => {
    expect(FeishuCalendarSchema.properties.action).toBeDefined();
    expect(FeishuCalendarSchema.properties.action.enum).toContain("list_calendars");
    expect(FeishuCalendarSchema.properties.action.enum).toContain("create_event");
    expect(FeishuCalendarSchema.properties.action.enum).toContain("search_events");
    expect(FeishuCalendarSchema.properties.action.enum).toContain("freebusy");
  });

  it("defines all 8 actions", () => {
    expect(FeishuCalendarSchema.properties.action.enum).toHaveLength(8);
  });

  it("has calendar_id, event_id, summary, start_time, end_time fields", () => {
    const props = FeishuCalendarSchema.properties;
    expect(props.calendar_id).toBeDefined();
    expect(props.event_id).toBeDefined();
    expect(props.summary).toBeDefined();
    expect(props.start_time).toBeDefined();
    expect(props.end_time).toBeDefined();
  });

  it("has attendee_ids as array", () => {
    const attendees = FeishuCalendarSchema.properties.attendee_ids;
    expect(attendees).toBeDefined();
    expect(attendees.type).toBe("array");
  });

  it("has pagination and accountId fields", () => {
    const props = FeishuCalendarSchema.properties;
    expect(props.page_size).toBeDefined();
    expect(props.page_token).toBeDefined();
    expect(props.accountId).toBeDefined();
  });
});
