import { describe, it, expect, vi } from "vitest";
import { createCnLogger } from "../logger.js";

describe("createCnLogger", () => {
  it("prefixes messages with [cn-adapter:{subsystem}]", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createCnLogger("test");
    log.info("hello world");
    expect(spy).toHaveBeenCalledWith("[cn-adapter:test] hello world");
    spy.mockRestore();
  });

  it("supports all log levels", () => {
    const log = createCnLogger("sub");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("each level uses the correct console method", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const log = createCnLogger("levels");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(debugSpy).toHaveBeenCalledWith("[cn-adapter:levels] d");
    expect(infoSpy).toHaveBeenCalledWith("[cn-adapter:levels] i");
    expect(warnSpy).toHaveBeenCalledWith("[cn-adapter:levels] w");
    expect(errorSpy).toHaveBeenCalledWith("[cn-adapter:levels] e");

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
