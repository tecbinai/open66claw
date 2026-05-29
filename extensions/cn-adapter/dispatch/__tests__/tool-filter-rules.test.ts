import { describe, it, expect } from "vitest";
import {
  buildToolFilterPolicy,
  isToolAllowed,
  CORE_ALWAYS_ON_TOOLS,
  INTENT_TOOL_MAP,
} from "../tool-filter-rules.js";

describe("CORE_ALWAYS_ON_TOOLS", () => {
  it("includes essential tools", () => {
    expect(CORE_ALWAYS_ON_TOOLS.has("read")).toBe(true);
    expect(CORE_ALWAYS_ON_TOOLS.has("write")).toBe(true);
    expect(CORE_ALWAYS_ON_TOOLS.has("edit")).toBe(true);
    expect(CORE_ALWAYS_ON_TOOLS.has("bash")).toBe(true);
    expect(CORE_ALWAYS_ON_TOOLS.has("glob")).toBe(true);
    expect(CORE_ALWAYS_ON_TOOLS.has("grep")).toBe(true);
  });
});

describe("INTENT_TOOL_MAP", () => {
  it("has general intent", () => {
    expect(INTENT_TOOL_MAP["general"]).toBeDefined();
    expect(INTENT_TOOL_MAP["general"]).toContain("web_search");
  });

  it("has coding intent", () => {
    expect(INTENT_TOOL_MAP["coding"]).toBeDefined();
    expect(INTENT_TOOL_MAP["coding"]).toContain("apply_patch");
  });

  it("has wechat_operation intent with wechat tools", () => {
    expect(INTENT_TOOL_MAP["wechat_operation"]).toContain("wechat_send");
  });
});

describe("buildToolFilterPolicy", () => {
  it("returns undefined when mode is off", () => {
    expect(buildToolFilterPolicy("coding", "off")).toBeUndefined();
  });

  it("returns undefined when intent is undefined", () => {
    expect(buildToolFilterPolicy(undefined, "intent")).toBeUndefined();
  });

  it("builds policy for coding intent", () => {
    const policy = buildToolFilterPolicy("coding", "intent");
    expect(policy).toBeDefined();
    expect(policy!.mode).toBe("intent");
    // Core tools included
    expect(policy!.allow.has("read")).toBe(true);
    expect(policy!.allow.has("write")).toBe(true);
    // Coding-specific tools included
    expect(policy!.allow.has("apply_patch")).toBe(true);
    expect(policy!.allow.has("web_search")).toBe(true);
  });

  it("builds policy for wechat_operation intent", () => {
    const policy = buildToolFilterPolicy("wechat_operation", "intent");
    expect(policy).toBeDefined();
    expect(policy!.allow.has("wechat_send")).toBe(true);
    expect(policy!.allow.has("wechat_read")).toBe(true);
  });

  it("falls back to general for unknown intent", () => {
    const policy = buildToolFilterPolicy("unknown_intent_xyz", "intent");
    expect(policy).toBeDefined();
    // Should have general's tools
    expect(policy!.allow.has("web_search")).toBe(true);
  });

  it("handles wildcard tools as prefixes", () => {
    const policy = buildToolFilterPolicy("database_query", "intent");
    expect(policy).toBeDefined();
    expect(policy!.allowPrefixes.length).toBeGreaterThan(0);
    expect(policy!.allowPrefixes[0]).toBe("mcp_database_");
  });
});

describe("isToolAllowed", () => {
  it("allows all tools when policy is undefined", () => {
    expect(isToolAllowed("anything", undefined)).toBe(true);
  });

  it("allows core tools", () => {
    const policy = buildToolFilterPolicy("general", "intent")!;
    expect(isToolAllowed("read", policy)).toBe(true);
    expect(isToolAllowed("write", policy)).toBe(true);
    expect(isToolAllowed("bash", policy)).toBe(true);
  });

  it("allows intent-specific tools", () => {
    const policy = buildToolFilterPolicy("wechat_operation", "intent")!;
    expect(isToolAllowed("wechat_send", policy)).toBe(true);
    expect(isToolAllowed("message", policy)).toBe(true);
  });

  it("blocks tools not in intent", () => {
    const policy = buildToolFilterPolicy("wechat_operation", "intent")!;
    expect(isToolAllowed("desktop_control", policy)).toBe(false);
    expect(isToolAllowed("image_gen", policy)).toBe(false);
  });

  it("allows wildcard-prefixed tools", () => {
    const policy = buildToolFilterPolicy("database_query", "intent")!;
    expect(isToolAllowed("mcp_database_query", policy)).toBe(true);
    expect(isToolAllowed("mcp_database_list_tables", policy)).toBe(true);
    expect(isToolAllowed("mcp_weather_get", policy)).toBe(false);
  });
});
