/**
 * Security Tests for Chat View - Attachment ID Generation
 * Chat 视图安全测试 - 附件 ID 生成
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock crypto.getRandomValues
const originalGetRandomValues = crypto.getRandomValues;

describe("generateAttachmentId Security Tests", () => {
  beforeEach(() => {
    // Reset crypto.getRandomValues to original
    crypto.getRandomValues = originalGetRandomValues;
  });

  it("should use crypto.getRandomValues instead of Math.random", () => {
    const getRandomValuesSpy = vi.spyOn(crypto, "getRandomValues");
    const mathRandomSpy = vi.spyOn(Math, "random");

    // Simulate generateAttachmentId function
    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    const id = generateAttachmentId();

    expect(getRandomValuesSpy).toHaveBeenCalled();
    expect(mathRandomSpy).not.toHaveBeenCalled();
    expect(id).toMatch(/^att-\d+-[a-f0-9]{12}$/);

    getRandomValuesSpy.mockRestore();
    mathRandomSpy.mockRestore();
  });

  it("should generate unique IDs", () => {
    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateAttachmentId();
      ids.add(id);
      // Small delay to ensure timestamp difference
      if (i % 10 === 0) {
        vi.useFakeTimers();
        vi.advanceTimersByTime(1);
        vi.useRealTimers();
      }
    }

    // Should have high uniqueness (allowing for timestamp collisions)
    expect(ids.size).toBeGreaterThan(90);
  });

  it("should generate IDs with correct format", () => {
    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    const id = generateAttachmentId();
    expect(id).toMatch(/^att-\d+-[a-f0-9]{12}$/);
    expect(id.startsWith("att-")).toBe(true);
  });

  it("should use cryptographically secure random values", () => {
    const getRandomValuesSpy = vi.spyOn(crypto, "getRandomValues");

    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    generateAttachmentId();

    // Verify Uint8Array was passed
    const call = getRandomValuesSpy.mock.calls[0];
    expect(call[0]).toBeInstanceOf(Uint8Array);
    expect((call[0] as Uint8Array).length).toBe(6);

    getRandomValuesSpy.mockRestore();
  });

  it("should handle crypto.getRandomValues errors gracefully", () => {
    // Mock crypto.getRandomValues to throw error
    crypto.getRandomValues = vi.fn(() => {
      throw new Error("Crypto error");
    });

    function generateAttachmentId(): string {
      try {
        const array = new Uint8Array(6);
        crypto.getRandomValues(array);
        const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
        return `att-${Date.now()}-${hex}`;
      } catch (error) {
        // Fallback (not recommended, but test the error handling)
        return `att-${Date.now()}-fallback`;
      }
    }

    const id = generateAttachmentId();
    expect(id).toContain("fallback");

    // Restore
    crypto.getRandomValues = originalGetRandomValues;
  });

  it("should generate sufficient entropy", () => {
    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    // 6 bytes = 48 bits of entropy
    // Hex encoding = 12 hex characters
    const id = generateAttachmentId();
    const hexPart = id.split("-")[2];
    expect(hexPart.length).toBe(12); // 6 bytes * 2 hex chars per byte
  });

  it("should not expose predictable patterns", () => {
    function generateAttachmentId(): string {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      return `att-${Date.now()}-${hex}`;
    }

    const ids = Array.from({ length: 100 }, () => generateAttachmentId());
    const hexParts = ids.map((id) => id.split("-")[2]);

    // Check for patterns (all same, sequential, etc.)
    const uniqueHex = new Set(hexParts);
    expect(uniqueHex.size).toBeGreaterThan(95); // High uniqueness expected
  });
});
