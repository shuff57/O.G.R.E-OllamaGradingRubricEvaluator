/**
 * element-picker.js — Content script for click-to-identify mode
 *
 * Injected into the page via chrome.scripting.executeScript when the user
 * wants to manually select an element (e.g., to correct a misidentified
 * selector during page discovery).
 *
 * Follows the same IIFE pattern as capture_area.js:
 * - Creates a full-page overlay
 * - Highlights elements on hover with border + tooltip showing CSS selector
 * - On click, captures the element and sends its CSS selector back
 * - Escape cancels and removes the overlay
 */
(function() {
  // Prevent double-injection
  if (window._ogreElementPicker) return;
  window._ogreElementPicker = true;

  // --- Overlay (captures all mouse events) ---
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'z-index:2147483646', 'cursor:crosshair',
    'background:rgba(0,0,0,0.08)',
  ].join(';');

  // --- Highlight box (follows hovered element) ---
  const highlight = document.createElement('div');
  highlight.style.cssText = [
    'position:fixed', 'border:3px solid #58a6ff',
    'background:rgba(88,166,255,0.12)', 'pointer-events:none',
    'z-index:2147483647', 'border-radius:3px',
    'transition:all 0.08s ease-out',
  ].join(';');

  // --- Tooltip (shows CSS selector of hovered element) ---
  const tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:fixed', 'background:#1a1a2e', 'color:#c9d1d9',
    'font:12px/1.4 "JetBrains Mono",monospace',
    'padding:5px 10px', 'border-radius:4px',
    'z-index:2147483647', 'pointer-events:none',
    'max-width:500px', 'overflow:hidden',
    'text-overflow:ellipsis', 'white-space:nowrap',
    'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
  ].join(';');

  // --- Instruction banner ---
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed', 'top:10px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1a1a2e', 'color:#58a6ff',
    'font:13px/1.4 "JetBrains Mono",sans-serif',
    'padding:8px 20px', 'border-radius:6px',
    'z-index:2147483647', 'pointer-events:none',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'border:1px solid #30363d',
  ].join(';');
  banner.textContent = 'Click an element to select it. Press Escape to cancel.';

  document.body.appendChild(overlay);
  document.body.appendChild(highlight);
  document.body.appendChild(tooltip);
  document.body.appendChild(banner);

  let lastTarget = null;

  // --- Hover: highlight element under cursor ---
  overlay.addEventListener('mousemove', (e) => {
    // Temporarily disable overlay to find element beneath it
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = '';

    if (!el || el === overlay || el === highlight || el === tooltip || el === banner) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      lastTarget = null;
      return;
    }

    lastTarget = el;

    // Position highlight over the element
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';

    // Show selector in tooltip
    const selector = generateSelector(el);
    tooltip.textContent = selector;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 520) + 'px';
    tooltip.style.top = Math.max(e.clientY - 34, 4) + 'px';
  });

  // --- Click: capture element and send selector ---
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastTarget) return;

    const selector = generateSelector(lastTarget);
    const sampleText = lastTarget.textContent?.trim().substring(0, 100) || '';

    // Count how many elements match this selector on the page
    let matchCount = 0;
    try {
      matchCount = document.querySelectorAll(selector).length;
    } catch { /* invalid selector */ }

    cleanup();

    // Send result back to the extension
    chrome.runtime.sendMessage({
      action: 'elementPicked',
      selector,
      sampleText,
      matchCount,
      tagName: lastTarget.tagName.toLowerCase(),
    });
  });

  // --- Escape: cancel picker ---
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ action: 'elementPickCancelled' });
    }
  };
  document.addEventListener('keydown', onEsc);

  // --- Cleanup ---
  function cleanup() {
    [overlay, highlight, tooltip, banner].forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    document.removeEventListener('keydown', onEsc);
    window._ogreElementPicker = false;
  }

  // --- Selector Generation ---

  /**
   * Generate a CSS selector for an element. Prefers semantic attributes
   * over fragile class names, and builds the simplest possible selector.
   */
  function generateSelector(el) {
    // Strategy 1: Unique ID
    if (el.id && !el.id.match(/^\d/) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }

    const tag = el.tagName.toLowerCase();

    // Strategy 2: Semantic attributes (most robust)
    const semanticAttrs = ['aria-label', 'role', 'name', 'type', 'contenteditable', 'placeholder'];
    for (const attr of semanticAttrs) {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        if (val && val.length < 60) {
          const sel = `${tag}[${attr}="${CSS.escape(val)}"]`;
          try {
            if (document.querySelectorAll(sel).length <= 100) return sel;
          } catch { /* continue */ }
        }
      }
    }

    // Strategy 3: Data attributes
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) {
        const val = attr.value;
        if (val && val.length < 60) {
          const sel = `${tag}[${attr.name}="${CSS.escape(val)}"]`;
          try {
            if (document.querySelectorAll(sel).length <= 100) return sel;
          } catch { /* continue */ }
        }
        // Data attribute without value (presence check)
        const sel = `${tag}[${attr.name}]`;
        try {
          if (document.querySelectorAll(sel).length <= 100) return sel;
        } catch { /* continue */ }
      }
    }

    // Strategy 4: Meaningful class combinations
    if (el.classList.length > 0) {
      const classes = [...el.classList].filter(c => !c.match(/^[a-z]{1,2}\d+/) && c.length > 1);
      if (classes.length > 0) {
        const sel = `${tag}.${classes.map(c => CSS.escape(c)).join('.')}`;
        try {
          if (document.querySelectorAll(sel).length <= 100) return sel;
        } catch { /* continue */ }
      }
    }

    // Strategy 5: Tag with parent context (one level up)
    const parent = el.parentElement;
    if (parent && parent !== document.body) {
      const parentSel = generateParentSelector(parent);
      if (parentSel) {
        // Try direct child
        const childSel = `${parentSel} > ${tag}`;
        try {
          if (document.querySelectorAll(childSel).length <= 100) return childSel;
        } catch { /* continue */ }
      }
    }

    // Fallback: just the tag
    return tag;
  }

  /**
   * Generate a simple selector for a parent element (one level, no recursion).
   */
  function generateParentSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    const tag = el.tagName.toLowerCase();

    for (const attr of ['role', 'aria-label', 'name', 'data-lastchange']) {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        if (val && val.length < 60) return `${tag}[${attr}="${CSS.escape(val)}"]`;
        return `${tag}[${attr}]`;
      }
    }

    if (el.classList.length > 0) {
      const classes = [...el.classList].filter(c => c.length > 1);
      if (classes.length > 0) return `${tag}.${classes.map(c => CSS.escape(c)).join('.')}`;
    }

    return tag;
  }
})();
