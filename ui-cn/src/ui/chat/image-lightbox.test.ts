/**
 * Tests for image-lightbox — Phase 4.
 *
 * Tests that the lightbox component:
 * - Creates proper DOM structure with accessibility attributes
 * - Closes on backdrop click
 * - Closes on close button click
 * - Closes on Escape key
 * - Prevents body scroll when open
 * - Restores body scroll on close
 * - Only allows one lightbox at a time (singleton pattern)
 * - Properly cleans up event listeners
 */

import { describe, expect, it, afterEach } from "vitest";
import { openImageLightbox } from "./image-lightbox";

function cleanupLightbox() {
  // Remove any lingering lightbox overlays
  document.querySelectorAll(".image-lightbox").forEach((el) => el.remove());
  document.body.style.overflow = "";
}

afterEach(cleanupLightbox);

describe("openImageLightbox", () => {
  it("creates an overlay with the correct structure", () => {
    openImageLightbox("https://example.com/test.png");

    const overlay = document.querySelector(".image-lightbox");
    expect(overlay).not.toBeNull();

    const backdrop = overlay!.querySelector(".image-lightbox__backdrop");
    expect(backdrop).not.toBeNull();

    const img = overlay!.querySelector(".image-lightbox__img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain("test.png");

    const closeBtn = overlay!.querySelector(".image-lightbox__close");
    expect(closeBtn).not.toBeNull();
  });

  it("sets correct accessibility attributes", () => {
    openImageLightbox("https://example.com/a11y.png");

    const overlay = document.querySelector(".image-lightbox");
    expect(overlay!.getAttribute("role")).toBe("dialog");
    expect(overlay!.getAttribute("aria-modal")).toBe("true");
    expect(overlay!.getAttribute("aria-label")).toBe("Image preview");
  });

  it("sets correct image alt text", () => {
    openImageLightbox("https://example.com/alt.png");

    const img = document.querySelector(".image-lightbox__img") as HTMLImageElement;
    expect(img.alt).toBe("Full-size preview");
  });

  it("prevents body scroll when opened", () => {
    document.body.style.overflow = "";
    openImageLightbox("https://example.com/scroll.png");

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when closed via close button", () => {
    openImageLightbox("https://example.com/restore.png");
    expect(document.body.style.overflow).toBe("hidden");

    const closeBtn = document.querySelector(".image-lightbox__close") as HTMLElement;
    closeBtn.click();

    expect(document.body.style.overflow).toBe("");
    expect(document.querySelector(".image-lightbox")).toBeNull();
  });

  it("closes when backdrop is clicked", () => {
    openImageLightbox("https://example.com/backdrop.png");

    const backdrop = document.querySelector(".image-lightbox__backdrop") as HTMLElement;
    backdrop.click();

    expect(document.querySelector(".image-lightbox")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes when Escape key is pressed", () => {
    openImageLightbox("https://example.com/esc.png");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(".image-lightbox")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("replaces existing lightbox (singleton pattern)", () => {
    openImageLightbox("https://example.com/first.png");
    expect(document.querySelectorAll(".image-lightbox").length).toBe(1);

    openImageLightbox("https://example.com/second.png");
    expect(document.querySelectorAll(".image-lightbox").length).toBe(1);

    const img = document.querySelector(".image-lightbox__img") as HTMLImageElement;
    expect(img.src).toContain("second.png");
  });

  it("does not error when closing with no active lightbox", () => {
    // Opening then closing should work
    openImageLightbox("https://example.com/once.png");
    const closeBtn = document.querySelector(".image-lightbox__close") as HTMLElement;
    closeBtn.click();

    // Second Escape shouldn't throw
    expect(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }).not.toThrow();
  });

  it("does not close on non-Escape keys", () => {
    openImageLightbox("https://example.com/other-key.png");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.querySelector(".image-lightbox")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(document.querySelector(".image-lightbox")).not.toBeNull();

    // Cleanup
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  it("close button has correct attributes", () => {
    openImageLightbox("https://example.com/btn-attrs.png");

    const closeBtn = document.querySelector(".image-lightbox__close") as HTMLButtonElement;
    expect(closeBtn.getAttribute("aria-label")).toBe("Close preview");
    expect(closeBtn.type).toBe("button");
  });
});
