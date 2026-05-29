/**
 * Image Lightbox — click-to-zoom image viewer with multi-image support.
 *
 * Features:
 *   - Full-screen overlay with zoom
 *   - Multi-image navigation (left/right arrows, keyboard)
 *   - Download button
 *   - Close via backdrop click, Escape key, or close button
 *
 * CN-only module.
 */

let activeLightbox: HTMLElement | null = null;
let currentImages: string[] = [];
let currentIndex = 0;

/**
 * Open an image in a lightbox overlay.
 * If `allImages` is provided, enables multi-image navigation.
 */
export function openImageLightbox(imageUrl: string, allImages?: string[]): void {
  closeLightbox();

  currentImages = allImages ?? [imageUrl];
  currentIndex = currentImages.indexOf(imageUrl);
  if (currentIndex === -1) currentIndex = 0;

  const overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image preview");

  const backdrop = document.createElement("div");
  backdrop.className = "image-lightbox__backdrop";

  const img = document.createElement("img");
  img.className = "image-lightbox__img";
  img.src = currentImages[currentIndex]!;
  img.alt = "Full-size preview";

  const closeBtn = document.createElement("button");
  closeBtn.className = "image-lightbox__close";
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Close preview");
  closeBtn.type = "button";

  // Download button
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "image-lightbox__download";
  downloadBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" x2="12" y1="15" y2="3"/></svg>';
  downloadBtn.setAttribute("aria-label", "Download image");
  downloadBtn.type = "button";

  overlay.appendChild(backdrop);
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  overlay.appendChild(downloadBtn);

  // Multi-image navigation
  let counter: HTMLElement | null = null;
  if (currentImages.length > 1) {
    counter = document.createElement("div");
    counter.className = "image-lightbox__counter";
    counter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
    overlay.appendChild(counter);

    const prevBtn = document.createElement("button");
    prevBtn.className = "image-lightbox__nav image-lightbox__nav--prev";
    prevBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<polyline points="15 18 9 12 15 6"/></svg>';
    prevBtn.type = "button";
    prevBtn.setAttribute("aria-label", "Previous image");

    const nextBtn = document.createElement("button");
    nextBtn.className = "image-lightbox__nav image-lightbox__nav--next";
    nextBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<polyline points="9 18 15 12 9 6"/></svg>';
    nextBtn.type = "button";
    nextBtn.setAttribute("aria-label", "Next image");

    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigate(-1, img, counter);
    });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigate(1, img, counter);
    });

    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
  }

  backdrop.addEventListener("click", closeLightbox);
  closeBtn.addEventListener("click", closeLightbox);
  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadCurrent();
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft" && currentImages.length > 1) navigate(-1, img, counter);
    if (e.key === "ArrowRight" && currentImages.length > 1) navigate(1, img, counter);
  };
  document.addEventListener("keydown", handleKeydown);

  overlay.dataset.keydownCleanup = "true";
  (overlay as unknown as { _keydownHandler: (e: KeyboardEvent) => void })._keydownHandler =
    handleKeydown;

  document.body.appendChild(overlay);
  activeLightbox = overlay;
  document.body.style.overflow = "hidden";
  closeBtn.focus();
}

function navigate(direction: number, img: HTMLImageElement, counter: HTMLElement | null): void {
  currentIndex = (currentIndex + direction + currentImages.length) % currentImages.length;
  img.src = currentImages[currentIndex]!;
  if (counter) {
    counter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
  }
}

function downloadCurrent(): void {
  const url = currentImages[currentIndex];
  if (!url) return;

  if (url.startsWith("data:") || url.startsWith("/") || url.startsWith(window.location.origin)) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `image_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `image_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(console.error);
  }
}

function closeLightbox(): void {
  if (!activeLightbox) return;

  const overlay = activeLightbox;
  activeLightbox = null;

  const handler = (overlay as unknown as { _keydownHandler?: (e: KeyboardEvent) => void })
    ._keydownHandler;
  if (handler) {
    document.removeEventListener("keydown", handler);
  }

  document.body.style.overflow = "";
  overlay.remove();
  currentImages = [];
  currentIndex = 0;
}
