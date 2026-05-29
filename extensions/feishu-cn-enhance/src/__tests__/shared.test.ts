import { describe, it, expect } from "vitest";
import { json } from "../shared.js";

describe("shared utilities", () => {
  describe("json()", () => {
    it("wraps data in tool-result format", () => {
      const result = json({ foo: "bar" });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual({ foo: "bar" });
      expect(result.details).toEqual({ foo: "bar" });
    });

    it("handles null", () => {
      const result = json(null);
      expect(result.content[0].text).toBe("null");
    });

    it("handles arrays", () => {
      const result = json([1, 2, 3]);
      expect(JSON.parse(result.content[0].text)).toEqual([1, 2, 3]);
    });
  });
});
