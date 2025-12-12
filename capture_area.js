(function() {
  if (window.hasScreenCaptureOverlay) return;
  window.hasScreenCaptureOverlay = true;

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
  overlay.style.zIndex = '2147483647'; // Max z-index
  overlay.style.cursor = 'crosshair';

  const selectionBox = document.createElement('div');
  selectionBox.style.border = '2px solid #2563eb';
  selectionBox.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
  selectionBox.style.position = 'absolute';
  selectionBox.style.display = 'none';
  selectionBox.style.pointerEvents = 'none'; // Let events pass through to overlay
  overlay.appendChild(selectionBox);

  document.body.appendChild(overlay);

  let startX, startY;
  let isDrawing = false;

  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    isDrawing = true;
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = selectionBox.getBoundingClientRect();
    
    // Cleanup
    document.body.removeChild(overlay);
    window.hasScreenCaptureOverlay = false;

    // Only capture if area is significant
    if (rect.width > 5 && rect.height > 5) {
      chrome.runtime.sendMessage({
        action: "areaSelected",
        area: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          devicePixelRatio: window.devicePixelRatio
        }
      });
    }
  }

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  
  // Escape to cancel
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      window.hasScreenCaptureOverlay = false;
      document.removeEventListener('keydown', onEsc);
    }
  });
})();
