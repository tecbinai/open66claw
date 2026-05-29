import { describe, it, expect } from "vitest";
import { formatDockerBind, SETUP_API_PREFIX, SETUP_UI_PATH } from "../setup-wizard-utils.js";

describe("setup-wizard-utils", () => {
  describe("constants", () => {
    it("should export correct API prefix", () => {
      expect(SETUP_API_PREFIX).toBe("/api/setup");
    });

    it("should export correct UI path", () => {
      expect(SETUP_UI_PATH).toBe("/setup");
    });
  });

  describe("formatDockerBind", () => {
    it("should format a simple path", () => {
      expect(formatDockerBind("/home/user/workspace")).toBe(
        "/home/user/workspace:/trusted/workspace:rw",
      );
    });

    it("should handle nested paths", () => {
      expect(formatDockerBind("/home/user/projects/myapp")).toBe(
        "/home/user/projects/myapp:/trusted/myapp:rw",
      );
    });

    it("should use basename only for container path", () => {
      expect(formatDockerBind("/a/b/c/deep-dir")).toBe("/a/b/c/deep-dir:/trusted/deep-dir:rw");
    });
  });
});
