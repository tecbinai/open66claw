import { describe, expect, it } from "vitest";
import { shallowCloneAtPath, setPathValue, removePathValue } from "./form-utils";

describe("shallowCloneAtPath", () => {
  it("clones string-key path without mutating original", () => {
    const root = { a: { b: { c: 1 } } };
    const cloned = shallowCloneAtPath(root, ["a", "b", "c"]);
    setPathValue(cloned, ["a", "b", "c"], 99);
    expect(cloned.a).not.toBe(root.a);
    expect((root.a as any).b.c).toBe(1);
    expect((cloned.a as any).b.c).toBe(99);
  });

  it("clones through array index without corrupting siblings", () => {
    const root = {
      agents: {
        list: [
          { id: "a", name: "Agent A" },
          { id: "b", name: "Agent B" },
          { id: "c", name: "Agent C" },
        ],
      },
    };
    // Simulate updating agents.list[2].name
    const cloned = shallowCloneAtPath(root, ["agents", "list", 2, "name"]);
    setPathValue(cloned, ["agents", "list", 2, "name"], "Updated C");

    // The original must be untouched
    expect((root.agents.list[2] as any).name).toBe("Agent C");
    // The clone must have the updated value
    const clonedList = (cloned as any).agents.list;
    expect(clonedList[2].name).toBe("Updated C");

    // CRITICAL: agents.list[2] must still be an object, NOT an array
    expect(Array.isArray(clonedList[2])).toBe(false);
    expect(typeof clonedList[2]).toBe("object");
    expect(clonedList[2].id).toBe("c");

    // Siblings must be preserved
    expect(clonedList[0].id).toBe("a");
    expect(clonedList[1].id).toBe("b");
    expect(clonedList.length).toBe(3);
  });

  it("does not mutate original array elements when updating through index", () => {
    const root = {
      agents: {
        list: [
          { id: "x", tools: { profile: "default" } },
        ],
      },
    };
    const cloned = shallowCloneAtPath(root, ["agents", "list", 0, "tools", "profile"]);
    setPathValue(cloned, ["agents", "list", 0, "tools", "profile"], "custom");

    expect((root.agents.list[0] as any).tools.profile).toBe("default");
    expect((cloned as any).agents.list[0].tools.profile).toBe("custom");
  });

  it("handles nested arrays without corruption", () => {
    const root = {
      channels: {
        feishu: {
          accounts: {
            default: { appId: "cli_a" },
            "bot-2": { appId: "cli_b" },
          },
        },
      },
    };
    const cloned = shallowCloneAtPath(root, [
      "channels",
      "feishu",
      "accounts",
      "bot-2",
      "appId",
    ]);
    setPathValue(cloned, ["channels", "feishu", "accounts", "bot-2", "appId"], "cli_new");

    expect((root.channels.feishu.accounts as any)["bot-2"].appId).toBe("cli_b");
    expect((cloned as any).channels.feishu.accounts["bot-2"].appId).toBe("cli_new");
  });
});

describe("setPathValue", () => {
  it("sets value at nested path", () => {
    const obj: Record<string, unknown> = { a: { b: { c: 1 } } };
    setPathValue(obj, ["a", "b", "c"], 2);
    expect((obj.a as any).b.c).toBe(2);
  });

  it("creates intermediate objects", () => {
    const obj: Record<string, unknown> = {};
    setPathValue(obj, ["a", "b", "c"], 1);
    expect((obj as any).a.b.c).toBe(1);
  });

  it("creates intermediate arrays when next key is number", () => {
    const obj: Record<string, unknown> = {};
    setPathValue(obj, ["a", 0, "b"], "val");
    expect(Array.isArray((obj as any).a)).toBe(true);
    expect((obj as any).a[0].b).toBe("val");
  });
});

describe("removePathValue", () => {
  it("removes object key", () => {
    const obj = { a: { b: 1, c: 2 } };
    removePathValue(obj, ["a", "b"]);
    expect((obj.a as any).b).toBeUndefined();
    expect((obj.a as any).c).toBe(2);
  });

  it("splices array element", () => {
    const obj = { list: [10, 20, 30] };
    removePathValue(obj, ["list", 1]);
    expect(obj.list).toEqual([10, 30]);
  });
});
