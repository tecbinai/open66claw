/**
 * Image Gallery — overlay view showing recent generated images.
 *
 * Opens as a full-screen overlay with a masonry grid of generated images
 * from the current session's history. Clicking an image opens it in the
 * lightbox for full-size viewing.
 */

import { html, nothing, render, type TemplateResult } from "lit";
import { openImageLightbox } from "./image-lightbox.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GalleryImage = {
  /** URL to the image (local or remote). */
  url: string;
  /** Prompt used to generate this image. */
  prompt?: string;
  /** Provider/model that generated it. */
  model?: string;
  /** Timestamp of generation. */
  timestamp?: number;
};

export type ImageGalleryProps = {
  images: GalleryImage[];
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Gallery Render
// ---------------------------------------------------------------------------

/**
 * Render the image gallery overlay.
 */
export function renderImageGallery(props: ImageGalleryProps): TemplateResult {
  const { images, onClose } = props;
  const allUrls = images.map((img) => img.url);

  return html`
    <div class="image-gallery-overlay" role="dialog" aria-modal="true" aria-label="Image gallery" @click=${(
      e: Event,
    ) => {
      if ((e.target as HTMLElement).classList.contains("image-gallery-overlay")) {
        onClose();
      }
    }}>
      <div class="image-gallery">
        <!-- Header -->
        <div class="image-gallery__header">
          <h3 class="image-gallery__title">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>生成图片 (${images.length})</span>
          </h3>
          <button class="image-gallery__close" aria-label="Close gallery" @click=${onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <!-- Grid -->
        ${
          images.length === 0
            ? html`
                <div class="image-gallery__empty">
                  <svg
                    viewBox="0 0 24 24"
                    width="40"
                    height="40"
                    stroke="currentColor"
                    fill="none"
                    stroke-width="1.5"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  <p>还没有生成过图片</p>
                  <p class="image-gallery__empty-hint">在对话框中输入图片描述，即可生成图片</p>
                </div>
              `
            : html`
              <div class="image-gallery__grid">
                ${images.map(
                  (img, index) => html`
                  <div class="image-gallery__item" @click=${() => {
                    openImageLightbox(img.url, allUrls);
                  }}>
                    <img
                      src=${img.url}
                      alt=${img.prompt ?? "Generated image"}
                      loading="eager"
                      decoding="async"
                      @error=${(e: Event) => {
                        (e.target as HTMLElement)
                          .closest(".image-gallery__item")
                          ?.classList.add("image-gallery__item--failed");
                      }}
                    />
                    ${
                      img.prompt
                        ? html`
                      <div class="image-gallery__item-overlay">
                        <span class="image-gallery__item-prompt">${img.prompt}</span>
                      </div>
                    `
                        : nothing
                    }
                  </div>
                `,
                )}
              </div>
            `
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Open/Close helpers
// ---------------------------------------------------------------------------

let _galleryElement: HTMLElement | null = null;

/**
 * Open the image gallery overlay.
 */
export function openImageGallery(images: GalleryImage[]): void {
  closeImageGallery();

  const container = document.createElement("div");
  container.id = "image-gallery-root";

  const template = renderImageGallery({
    images,
    onClose: closeImageGallery,
  });
  render(template, container);
  document.body.appendChild(container);
  _galleryElement = container;

  // Close on Escape (store ref for cleanup)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeImageGallery();
  };
  document.addEventListener("keydown", onKeyDown);
  (container as unknown as { _escHandler: (e: KeyboardEvent) => void })._escHandler = onKeyDown;
}

/**
 * Close the image gallery overlay.
 */
export function closeImageGallery(): void {
  if (_galleryElement) {
    // Clean up Escape key listener
    const handler = (_galleryElement as unknown as { _escHandler?: (e: KeyboardEvent) => void })
      ._escHandler;
    if (handler) document.removeEventListener("keydown", handler);
    _galleryElement.remove();
    _galleryElement = null;
  }
  const existing = document.getElementById("image-gallery-root");
  existing?.remove();
}
