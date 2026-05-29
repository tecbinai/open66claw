import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/config/config.js", () => ({
  loadConfig: vi.fn(),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
}));

import { loadConfig } from "../../../../src/config/config.js";
import {
  getSetupState,
  updateSetupState,
  setChannelStartCallback,
  getChannelStartCallback,
} from "../setup-wizard-state.js";

describe("setup-wizard-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module-level state by re-setting to initial values
    updateSetupState({ step: 1, completed: false, region: "cn", provider: undefined });
  });

  describe("getSetupState", () => {
    it("should return initial state when config is empty", () => {
      vi.mocked(loadConfig).mockReturnValue({} as any);
      const state = getSetupState();
      expect(state).toMatchObject({
        region: "cn",
        completed: false,
      });
    });

    it("should detect completed setup", () => {
      vi.mocked(loadConfig).mockReturnValue({
        models: { providers: { openai: {} } },
        agents: { defaults: { workspace: "/tmp" } },
        setup: { completedAt: "2026-01-01" },
      } as any);

      const state = getSetupState();
      expect(state.completed).toBe(true);
    });

    it("should resume from last completed step", () => {
      vi.mocked(loadConfig).mockReturnValue({
        models: { providers: {} },
        setup: { lastCompletedStep: 2 },
      } as any);

      const state = getSetupState();
      expect(state.step).toBe(3);
    });
  });

  describe("updateSetupState", () => {
    it("should merge partial updates", () => {
      vi.mocked(loadConfig).mockReturnValue({} as any);
      const state = updateSetupState({ step: 2, provider: "openai" });
      expect(state.step).toBe(2);
      expect(state.provider).toBe("openai");
    });
  });

  describe("channel start callback", () => {
    it("should initially be null", () => {
      expect(getChannelStartCallback()).toBeNull();
    });

    it("should store and retrieve callback", () => {
      const cb = vi.fn();
      setChannelStartCallback(cb);
      expect(getChannelStartCallback()).toBe(cb);
    });
  });
});
