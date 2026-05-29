import { describe, expect, it, vi } from "vitest";

// Mock tMaybe before importing the module under test
const mockTranslations: Record<string, string> = {
  "config.field.setup.completedAt": "安装完成时间",
  "config.field.gateway.remote.url": "远程网关 URL",
  "config.field.agents.list.*.identity.avatar": "身份头像",
  "config.field.agents.list[].tools.profile": "智能体工具配置方案",
  "config.field.plugins.entries.*.enabled": "插件已启用",
};

vi.mock("../i18n/index.js", () => ({
  tMaybe: (key: string) => mockTranslations[key] ?? key,
}));

const { resolveLabel, humanize, pathKey } = await import("./config-form.shared");

describe("resolveLabel", () => {
  it("returns i18n translation for exact key match", () => {
    const result = resolveLabel(["setup", "completedAt"], undefined, {});
    expect(result).toBe("安装完成时间");
  });

  it("returns i18n translation for dotted path", () => {
    const result = resolveLabel(["gateway", "remote", "url"], undefined, {});
    expect(result).toBe("远程网关 URL");
  });

  it("falls back to hint.label when no i18n key exists", () => {
    const result = resolveLabel(["some", "unknown", "field"], { label: "My Hint Label" }, {});
    expect(result).toBe("My Hint Label");
  });

  it("falls back to schema.title when no i18n or hint", () => {
    const result = resolveLabel(["some", "unknown", "field"], undefined, { title: "Schema Title" });
    expect(result).toBe("Schema Title");
  });

  it("falls back to humanize when no i18n, hint, or title", () => {
    const result = resolveLabel(["some", "unknownField"], undefined, {});
    expect(result).toBe("Unknown Field");
  });

  it("uses fallbackKey for humanize when provided", () => {
    const result = resolveLabel(["section", "subsection"], undefined, {}, "myCustomKey");
    expect(result).toBe("My Custom Key");
  });

  // -- Wildcard matching (star variant) --
  it("matches star wildcard for array paths with numeric index", () => {
    // path: ["agents", "list", 0, "identity", "avatar"]
    // should match: config.field.agents.list.*.identity.avatar
    const result = resolveLabel(["agents", "list", 0, "identity", "avatar"], undefined, {});
    expect(result).toBe("身份头像");
  });

  // -- Wildcard matching (bracket variant) --
  it("matches bracket wildcard for array paths with numeric index", () => {
    // path: ["agents", "list", 0, "tools", "profile"]
    // should match: config.field.agents.list[].tools.profile
    const result = resolveLabel(["agents", "list", 0, "tools", "profile"], undefined, {});
    expect(result).toBe("智能体工具配置方案");
  });

  it("prefers star variant over bracket when both exist", () => {
    // "agents.list.*.identity.avatar" exists as star variant
    // resolveLabel tries star first, then bracket
    const result = resolveLabel(["agents", "list", 2, "identity", "avatar"], undefined, {});
    expect(result).toBe("身份头像");
  });

  it("falls back to hint.label when no wildcard match for array path", () => {
    const result = resolveLabel(
      ["agents", "list", 0, "some", "other"],
      { label: "Fallback Hint" },
      {},
    );
    expect(result).toBe("Fallback Hint");
  });

  it("does not attempt wildcard when path has no numeric index", () => {
    // path: ["plugins", "entries", "weather", "enabled"]
    // no numeric index → no wildcard attempt → falls back to hint
    const result = resolveLabel(
      ["plugins", "entries", "weather", "enabled"],
      { label: "Plugin Enabled (hint)" },
      {},
    );
    expect(result).toBe("Plugin Enabled (hint)");
  });

  // -- Priority order --
  it("i18n wins over hint.label", () => {
    const result = resolveLabel(
      ["setup", "completedAt"],
      { label: "English Hint Label" },
      { title: "Schema Title" },
    );
    expect(result).toBe("安装完成时间");
  });

  it("hint.label wins over schema.title", () => {
    const result = resolveLabel(["no", "i18n"], { label: "Hint" }, { title: "Title" });
    expect(result).toBe("Hint");
  });

  it("schema.title wins over humanize", () => {
    const result = resolveLabel(["no", "i18n"], undefined, { title: "Title" });
    expect(result).toBe("Title");
  });
});

describe("pathKey", () => {
  it("joins string segments with dots", () => {
    expect(pathKey(["a", "b", "c"])).toBe("a.b.c");
  });

  it("filters out numeric segments", () => {
    expect(pathKey(["agents", "list", 0, "name"])).toBe("agents.list.name");
  });

  it("handles empty path", () => {
    expect(pathKey([])).toBe("");
  });
});

describe("humanize", () => {
  it("converts camelCase to Title Case", () => {
    expect(humanize("completedAt")).toBe("Completed At");
  });

  it("converts underscores to spaces", () => {
    expect(humanize("some_field")).toBe("Some field");
  });

  it("handles already readable strings", () => {
    expect(humanize("enabled")).toBe("Enabled");
  });
});
