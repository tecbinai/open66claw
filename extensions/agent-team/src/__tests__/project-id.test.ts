import { describe, expect, it } from "vitest";
import { generateProjectId, isValidProjectId, sanitizeProjectId } from "../project-id.js";

describe("project-id", () => {
  describe("generateProjectId", () => {
    it("generates IDs in correct format", () => {
      const id = generateProjectId();
      expect(id).toMatch(/^proj-\d{8}-[a-f0-9]{8}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateProjectId());
      }
      expect(ids.size).toBe(100);
    });

    it("uses current date", () => {
      const id = generateProjectId();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      expect(id).toContain(`proj-${today}-`);
    });
  });

  describe("sanitizeProjectId", () => {
    it("accepts valid IDs", () => {
      expect(sanitizeProjectId("proj-20260227-a3f7bc12")).toBe("proj-20260227-a3f7bc12");
      expect(sanitizeProjectId("my_project-1")).toBe("my_project-1");
    });

    it("rejects path traversal attempts", () => {
      expect(() => sanitizeProjectId("../../../etc/passwd")).toThrow("Invalid projectId");
      expect(() => sanitizeProjectId("foo/bar")).toThrow("Invalid projectId");
      expect(() => sanitizeProjectId("foo bar")).toThrow("Invalid projectId");
      expect(() => sanitizeProjectId("")).toThrow("Invalid projectId");
    });
  });

  describe("isValidProjectId", () => {
    it("returns true for valid IDs", () => {
      expect(isValidProjectId("proj-20260227-a3f7bc12")).toBe(true);
      expect(isValidProjectId("test-123")).toBe(true);
    });

    it("returns false for invalid IDs", () => {
      expect(isValidProjectId("../foo")).toBe(false);
      expect(isValidProjectId("foo bar")).toBe(false);
      expect(isValidProjectId("")).toBe(false);
    });
  });
});
