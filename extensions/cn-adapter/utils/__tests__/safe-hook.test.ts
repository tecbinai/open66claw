import { describe, it, expect, vi } from "vitest";
import { safeHook, safeGateway } from "../safe-hook.js";

describe("safeHook", () => {
  it("non-critical: catches error and returns undefined", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = safeHook("test-hook", async () => {
      throw new Error("boom");
    });
    const result = await handler();
    expect(result).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[cn-adapter:hook] test-hook failed: boom"),
    );
    spy.mockRestore();
  });

  it("non-critical: passes through normal return value", async () => {
    const handler = safeHook("test-hook", async () => {
      return { prependSystemContext: "hello" };
    });
    const result = await handler();
    expect(result).toEqual({ prependSystemContext: "hello" });
  });

  it("critical: re-throws after logging", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = safeHook(
      "test-hook",
      async () => {
        throw new Error("critical-boom");
      },
      { critical: true },
    );
    await expect(handler()).rejects.toThrow("critical-boom");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes arguments through to the handler", async () => {
    const handler = safeHook("test-hook", async (a: number, b: string) => `${a}-${b}`);
    const result = await handler(42, "hello");
    expect(result).toBe("42-hello");
  });
});

describe("safeGateway", () => {
  it("calls respond(false, ...) on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let capturedOk: boolean | undefined;
    let capturedError: any;

    const mockOpts = {
      respond: (ok: boolean, payload: unknown, error: unknown) => {
        capturedOk = ok;
        capturedError = error;
      },
    } as any;

    const handler = safeGateway("test-method", async () => {
      throw new Error("gw-boom");
    });

    await handler(mockOpts);
    expect(capturedOk).toBe(false);
    expect(capturedError).toMatchObject({
      code: "CN_INTERNAL_ERROR",
      message: expect.stringContaining("gw-boom"),
    });
    spy.mockRestore();
  });

  it("passes through on success", async () => {
    let respondCalled = false;
    const mockOpts = {
      respond: (ok: boolean) => {
        respondCalled = true;
      },
    } as any;

    const handler = safeGateway("test-method", async (opts) => {
      opts.respond(true, { data: "ok" });
    });

    await handler(mockOpts);
    expect(respondCalled).toBe(true);
  });

  it("critical: re-throws after responding with error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let respondCalled = false;
    const mockOpts = {
      respond: () => {
        respondCalled = true;
      },
    } as any;

    const handler = safeGateway(
      "test-method",
      async () => {
        throw new Error("critical-gw");
      },
      { critical: true },
    );

    await expect(handler(mockOpts)).rejects.toThrow("critical-gw");
    expect(respondCalled).toBe(true);
    spy.mockRestore();
  });

  it("survives respond itself throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockOpts = {
      respond: () => {
        throw new Error("respond-broken");
      },
    } as any;

    const handler = safeGateway("test-method", async () => {
      throw new Error("handler-error");
    });

    // Should not throw even though respond() throws
    await handler(mockOpts);
    spy.mockRestore();
  });
});
