// Says whether the page is mostly one frame, as when a school's site shows
// a grading tool inside itself, and gives a selector for that frame.
// Returns null where the page is not like that, or where no selector finds
// that one frame. Reads nothing of what the page or the frame shows.
(() => {
  const shown = (el) => el.getClientRects().length > 0;
  const area = (el) => {
    const box = el.getBoundingClientRect();
    return Math.max(0, box.width) * Math.max(0, box.height);
  };
  const whole = window.innerWidth * window.innerHeight;
  const frames = Array.from(document.querySelectorAll('iframe'))
    .filter(shown)
    .sort((a, b) => area(b) - area(a));
  const frame = frames[0];
  if (!frame || !whole || area(frame) < 0.5 * whole) return null;

  const quoted = (value) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const only = (selector) => {
    try {
      const found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === frame ? selector : null;
    } catch (e) {
      return null;
    }
  };
  return (
    (frame.id && only('iframe#' + CSS.escape(frame.id))) ||
    (frame.name && only('iframe[name=' + quoted(frame.name) + ']')) ||
    (frame.title && only('iframe[title=' + quoted(frame.title) + ']')) ||
    only('iframe') ||
    null
  );
})()
