import { describe, it, expect, beforeEach } from "vitest";
import { createToolFilterHandler, setDispatchIntent, clearDispatchIntent } from "../tool-filter.js";

describe("createToolFilterHandler", () => {
  beforeEach(() => {
    clearDispatchIntent();
  });

  it("returns undefined when no dispatch intent is set (mode=off)", async () => {
    const handler = createToolFilterHandler(() => ({ securityTier: "full" }));
    const result = await handler({ toolName: "bash", params: {} });
    expect(result).toBeUndefined();
  });

  it("returns undefined for all tools when mode is off", async () => {
    setDispatchIntent("coding", "intent");
    const handler = createToolFilterHandler(() => ({
      securityTier: "full",
      toolFilterMode: "off",
    }));
    const result = await handler({ toolName: "desktop_control", params: {} });
    expect(result).toBeUndefined();
  });

  it("allows core tools when dispatch intent is set", async () => {
    setDispatchIntent("wechat_operation", "intent");
    const handler = createToolFilterHandler(() => ({ securityTier: "full" }));

    for (const tool of ["read", "write", "edit", "bash", "glob", "grep"]) {
      const result = await handler({ toolName: tool, params: {} });
      expect(result).toBeUndefined();
    }
  });

  it("allows intent-specific tools", async () => {
    setDispatchIntent("wechat_operation", "intent");
    const handler = createToolFilterHandler(() => ({ securityTier: "full" }));

    const result = await handler({ toolName: "wechat_send", params: {} });
    expect(result).toBeUndefined();
  });

  it("blocks tools not in intent", async () => {
    setDispatchIntent("wechat_operation", "intent");
    const handler = createToolFilterHandler(() => ({ securityTier: "full" }));

    const result = await handler({ toolName: "desktop_control", params: {} });
    expect(result).toBeDefined();
    expect(result!.block).toBe(true);
    expect(result!.blockReason).toContain("wechat_operation");
  });

  it("clearDispatchIntent resets to no-filter mode", async () => {
    setDispatchIntent("wechat_operation", "intent");
    clearDispatchIntent();
    const handler = createToolFilterHandler(() => ({ securityTier: "full" }));

    const result = await handler({ toolName: "desktop_control", params: {} });
    expect(result).toBeUndefined();
  });
});
