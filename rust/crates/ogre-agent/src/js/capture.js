// Lists the visible, interactive elements of the page.
var selectors = [
  'button', 'a[href]', 'input', 'textarea', 'select', 'summary',
  '[role="button"]', '[role="link"]', '[role="textbox"]',
  '[onclick]', '[contenteditable]'
];
var nodes = document.querySelectorAll(selectors.join(', '));
var viewWidth = window.innerWidth || document.documentElement.clientWidth;
var viewHeight = window.innerHeight || document.documentElement.clientHeight;
var elements = [];
var total = 0;

for (var i = 0; i < nodes.length; i++) {
  var el = nodes[i];
  if (!isVisible(el)) continue;
  total++;
  if (elements.length >= args.maxElements) continue;

  var rect = el.getBoundingClientRect();
  var info = describe(el, false);
  info.ref = refFor(el);
  info.selector = getSelector(el);
  info.inViewport = rect.top >= 0 && rect.bottom <= viewHeight && rect.left >= 0 && rect.right <= viewWidth;
  elements.push(info);
}

return {
  url: location.href,
  title: txt(document.title, 200),
  elements: elements,
  total: total,
  nextRef: registry().next
};
