// Finds one element on the live page and reports what it is and where it is
// right now. args: { ref | selector | focused, scroll, protectedSelectors }.
var el = null;
if (args.focused) {
  el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { found: false, error: 'nofocus' };
} else if (args.ref) {
  el = byRef(args.ref);
  if (!el) return { found: false, error: 'stale' };
} else {
  try {
    el = document.querySelector(args.selector);
  } catch (e) {
    return { found: false, error: 'invalid', message: String((e && e.message) || e) };
  }
  if (!el) return { found: false, error: 'missing' };
}

if (args.scroll && el.scrollIntoView) {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
}

var ACTIONABLE = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="link"], [onclick]';
function actionable(node) {
  var found = node.closest ? node.closest(ACTIONABLE) : null;
  if (found && found.tagName === 'LABEL' && found.control) found = found.control;
  return found;
}
function isProtected(node) {
  var list = args.protectedSelectors || [];
  for (var i = 0; i < list.length; i++) {
    try {
      if (node.closest && node.closest(list[i])) return true;
    } catch (e) { /* a bad selector protects nothing */ }
  }
  return false;
}

var rect = el.getBoundingClientRect();
var x = rect.left + rect.width / 2;
var y = rect.top + rect.height / 2;
var viewWidth = window.innerWidth || document.documentElement.clientWidth;
var viewHeight = window.innerHeight || document.documentElement.clientHeight;
var hasBox = rect.width > 0 && rect.height > 0;

var out = {
  found: true,
  ref: refFor(el),
  selector: getSelector(el),
  element: describe(el, true),
  x: x,
  y: y,
  hasBox: hasBox,
  inViewport: hasBox && x >= 0 && y >= 0 && x <= viewWidth && y <= viewHeight,
  isProtected: isProtected(el),
  nextRef: registry().next
};

var control = actionable(el);
if (control && control !== el) {
  out.control = describe(control, true);
  out.isProtected = out.isProtected || isProtected(control);
}

// What a click at that point would really land on, when it is not the element.
if (out.inViewport) {
  var hit = document.elementFromPoint(x, y);
  if (hit && hit !== el && !el.contains(hit) && !(control && control.contains(hit))) {
    var hitControl = actionable(hit) || hit;
    out.hit = describe(hitControl, true);
    out.isProtected = out.isProtected || isProtected(hitControl);
  }
}
return out;
