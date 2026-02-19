<script lang="ts">
  /**
   * ScreenshotOverlay — Area selection for webview screenshot capture (V1).
   *
   * Flow:
   *   1. Parent captures the webview screenshot + hides webview, then sets visible=true
   *   2. This overlay displays the captured image full-screen
   *   3. User draws a selection rectangle via click-and-drag
   *   4. On release (if area > min threshold), image is cropped and returned via onCapture
   *   5. Parent re-shows the webview
   *
   * Keyboard: Escape closes the overlay without capturing.
   */

  import { cropImageData } from '../lib/browser';

  interface Props {
    /** Controls overlay visibility (bindable). */
    visible?: boolean;
    /** Pre-captured screenshot from the webview (data URL). */
    capturedImage?: string;
    /** Called with the cropped base64 data URL on successful capture. */
    onCapture?: (imageData: string) => void;
    /** Called when the user cancels (Escape or backdrop click). */
    onClose?: () => void;
  }

  let {
    visible = $bindable(false),
    capturedImage = '',
    onCapture,
    onClose,
  }: Props = $props();

  // --- Selection state ---
  let isSelecting = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let selX = $state(0);
  let selY = $state(0);
  let selW = $state(0);
  let selH = $state(0);
  let hasSelection = $state(false);

  // --- Crop state ---
  let isCropping = $state(false);
  let cropError = $state('');

  // --- DOM refs ---
  let imageEl: HTMLImageElement | undefined = $state(undefined);
  let containerEl: HTMLDivElement | undefined = $state(undefined);

  /** Minimum selection size (px) to trigger capture. */
  const MIN_SIZE = 20;

  // Reset state when overlay closes
  $effect(() => {
    if (!visible) reset();
  });

  function reset() {
    isSelecting = false;
    hasSelection = false;
    selX = selY = selW = selH = 0;
    isCropping = false;
    cropError = '';
  }

  function handleClose() {
    visible = false;
    onClose?.();
  }

  // --- Image bounds helper ---
  function getImageBounds() {
    if (!imageEl) return null;
    return imageEl.getBoundingClientRect();
  }

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  // --- Mouse handlers (selection on the image) ---

  function handleMouseDown(e: MouseEvent) {
    if (isCropping) return;
    const bounds = getImageBounds();
    if (!bounds) return;

    // Only start if click is within image bounds
    if (
      e.clientX < bounds.left || e.clientX > bounds.right ||
      e.clientY < bounds.top || e.clientY > bounds.bottom
    ) return;

    isSelecting = true;
    hasSelection = false;
    cropError = '';
    startX = e.clientX - bounds.left;
    startY = e.clientY - bounds.top;
    selX = startX;
    selY = startY;
    selW = 0;
    selH = 0;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isSelecting) return;
    const bounds = getImageBounds();
    if (!bounds) return;

    const curX = clamp(e.clientX - bounds.left, 0, bounds.width);
    const curY = clamp(e.clientY - bounds.top, 0, bounds.height);

    selX = Math.min(startX, curX);
    selY = Math.min(startY, curY);
    selW = Math.abs(curX - startX);
    selH = Math.abs(curY - startY);
    hasSelection = selW > 4 && selH > 4;
  }

  function handleMouseUp() {
    if (!isSelecting) return;
    isSelecting = false;

    if (selW >= MIN_SIZE && selH >= MIN_SIZE) {
      hasSelection = true;
      doCrop();
    } else {
      hasSelection = false;
    }
  }

  // --- Crop the image to the selection ---
  async function doCrop() {
    if (!imageEl) return;
    isCropping = true;
    cropError = '';

    try {
      const bounds = getImageBounds()!;
      // Map display coordinates to image natural pixel coordinates
      const scaleX = imageEl.naturalWidth / bounds.width;
      const scaleY = imageEl.naturalHeight / bounds.height;

      const cropX = selX * scaleX;
      const cropY = selY * scaleY;
      const cropW = selW * scaleX;
      const cropH = selH * scaleY;

      const cropped = await cropImageData(capturedImage, cropX, cropY, cropW, cropH);
      onCapture?.(cropped);
      handleClose();
    } catch (err) {
      cropError = err instanceof Error ? err.message : 'Failed to crop screenshot';
      isCropping = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }

  // --- Compute image offset within container for dim-rect positioning ---
  function getImageOffset(): { left: number; top: number; width: number; height: number } {
    if (!imageEl || !containerEl) return { left: 0, top: 0, width: 0, height: 0 };
    const ib = imageEl.getBoundingClientRect();
    const cb = containerEl.getBoundingClientRect();
    return {
      left: ib.left - cb.left,
      top: ib.top - cb.top,
      width: ib.width,
      height: ib.height,
    };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if visible && capturedImage}
  <div
    class="screenshot-overlay"
    bind:this={containerEl}
    onkeydown={handleKeydown}
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    role="dialog"
    aria-label="Screenshot area selection"
    tabindex="-1"
  >
    <!-- Captured image (object-fit: contain centers it) -->
    <img
      bind:this={imageEl}
      src={capturedImage}
      alt="Webview screenshot — draw a rectangle to capture an area"
      class="captured-image"
      draggable="false"
    />

    <!-- Dim layer around the selection rectangle -->
    {#if hasSelection}
      {@const io = getImageOffset()}
      <!-- Top dim -->
      <div
        class="dim-rect"
        style="left:{io.left}px; top:{io.top}px; width:{io.width}px; height:{selY}px"
      ></div>
      <!-- Bottom dim -->
      <div
        class="dim-rect"
        style="left:{io.left}px; top:{io.top + selY + selH}px; width:{io.width}px; height:{io.height - selY - selH}px"
      ></div>
      <!-- Left dim -->
      <div
        class="dim-rect"
        style="left:{io.left}px; top:{io.top + selY}px; width:{selX}px; height:{selH}px"
      ></div>
      <!-- Right dim -->
      <div
        class="dim-rect"
        style="left:{io.left + selX + selW}px; top:{io.top + selY}px; width:{io.width - selX - selW}px; height:{selH}px"
      ></div>

      <!-- Selection border -->
      <div
        class="selection-rect"
        style="left:{io.left + selX}px; top:{io.top + selY}px; width:{selW}px; height:{selH}px"
      >
        <span class="selection-size">{Math.round(selW)} &times; {Math.round(selH)}</span>
      </div>
    {:else}
      <!-- Subtle dim when nothing selected yet -->
      <div class="dim-idle"></div>
    {/if}

    <!-- Instruction bar -->
    <div class="instruction-bar">
      {#if isCropping}
        <span class="instruction-text">
          <span class="spinner-tiny"></span>
          Cropping...
        </span>
      {:else if cropError}
        <span class="instruction-error">{cropError}</span>
      {:else}
        <span class="instruction-text">Click and drag to select an area</span>
      {/if}
      <button class="cancel-btn" onclick={handleClose} aria-label="Cancel screenshot">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Esc
      </button>
    </div>
  </div>
{/if}

<style>
  .screenshot-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background-color: #0a0a0f;
    cursor: crosshair;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
  }

  .captured-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  /* ---- Dimming rects (around selection) ---- */
  .dim-rect {
    position: absolute;
    background-color: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .dim-idle {
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.2);
    pointer-events: none;
  }

  /* ---- Selection rectangle ---- */
  .selection-rect {
    position: absolute;
    border: 2px dashed #22d3ee;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 12px rgba(34, 211, 238, 0.25);
    pointer-events: none;
    z-index: 2;
  }

  .selection-size {
    position: absolute;
    bottom: -22px;
    right: 0;
    font-size: 0.7rem;
    color: #22d3ee;
    background: rgba(0, 0, 0, 0.7);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    white-space: nowrap;
  }

  /* ---- Instruction bar (top gradient) ---- */
  .instruction-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
    z-index: 10;
    pointer-events: none;
  }

  .instruction-text {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.8);
    letter-spacing: 0.02em;
  }

  .instruction-error {
    font-size: 0.85rem;
    color: #f87171;
    letter-spacing: 0.02em;
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.75rem;
    cursor: pointer;
    pointer-events: auto;
    transition: background 0.15s;
  }

  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* ---- Tiny spinner for cropping state ---- */
  @keyframes spin-tiny {
    to { transform: rotate(360deg); }
  }

  .spinner-tiny {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #22d3ee;
    border-radius: 50%;
    animation: spin-tiny 0.6s linear infinite;
  }
</style>
