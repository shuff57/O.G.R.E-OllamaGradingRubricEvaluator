// Walks the visible page and returns a compact outline of it for working out
// where the students, score boxes and feedback boxes are. Reads only.
// Called as a function with { max_depth, max_text, max_repeats, max_visited }.
//
// What is deliberately left out, because the outline may be sent to an AI:
// the contents of form fields and editable areas, link and frame addresses,
// the options of drop-down lists, and the values of data-* attributes other
// than test ids.
(opts) => {
  const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'head', 'title', 'br', 'hr', 'wbr']);
  // Kept as a single node: what is inside is not page structure.
  const LEAVES = new Set(['svg', 'select', 'iframe', 'textarea', 'canvas', 'video', 'audio', 'object', 'math', 'button']);
  const CONTROLS = new Set(['button', 'a', 'input', 'select', 'textarea', 'label']);
  const ATTRS = ['id', 'class', 'name', 'type', 'role', 'aria-label', 'placeholder', 'for'];
  const TEST_ID = /^data-(testid|test-id|test|qa|cy|component)$/;
  const BUTTON_TYPES = ['submit', 'button', 'reset'];

  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const hidden = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
    if (style.display === 'contents' || el.offsetWidth === undefined) return false;
    if (el.offsetWidth !== 0 || el.offsetHeight !== 0) return false;
    // A box of no size still shows children that spill out of it.
    return el.childElementCount === 0 || style.overflowX !== 'visible' || style.overflowY !== 'visible';
  };

  // A rich text editor hides the field it replaces, and sites post hidden
  // fields alongside visible ones; both say where feedback ends up.
  const keptThoughHidden = (el) =>
    el.localName === 'textarea' || (el.localName === 'input' && el.type === 'hidden' && el.name);

  const idIsUnique = (id) => document.querySelectorAll('#' + CSS.escape(id)).length === 1;
  const selectorOf = (el, parent) => {
    if (el.id && idIsUnique(el.id)) return '#' + CSS.escape(el.id);
    let nth = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
      if (s.localName === el.localName) nth++;
    }
    return `${parent} > ${CSS.escape(el.localName)}:nth-of-type(${nth})`;
  };

  const clip = (text) => {
    const chars = Array.from(text);
    return chars.length > opts.max_text ? chars.slice(0, opts.max_text).join('') : text;
  };
  // Labels are prose and can name a student; ids, names and classes are needed whole.
  const PROSE = ['aria-label', 'placeholder'];

  const attrsOf = (el) => {
    const out = {};
    for (const attr of el.attributes) {
      if (PROSE.includes(attr.name)) out[attr.name] = clip(squash(attr.value));
      else if (ATTRS.includes(attr.name)) out[attr.name] = squash(attr.value);
      else if (TEST_ID.test(attr.name)) out[attr.name] = attr.value;
      else if (attr.name.startsWith('data-')) out[attr.name] = '';
    }
    if (el.isContentEditable && el.contentEditable !== 'inherit') out.contenteditable = 'true';
    if (el.localName === 'input' && BUTTON_TYPES.includes(el.type) && el.value) out.value = clip(squash(el.value));
    if (el.localName === 'select') out.options = String(el.options.length);
    return out;
  };

  const hasControls = (el) => !!el.querySelector('input, textarea, select, button');
  // The label of a button or link is its whole text; elsewhere only the text
  // directly inside the element, so that each piece of text appears once.
  const wholeText = (el) => el.localName === 'button' || (el.localName === 'a' && !hasControls(el));
  const textOf = (el) => {
    // What is in an editable area was typed there, like the value of a field.
    if (el.isContentEditable) return '';
    if (LEAVES.has(el.localName) && el.localName !== 'button') return '';
    if (wholeText(el)) return squash(el.textContent);
    let text = '';
    for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    return squash(text);
  };

  // A wrapper that says nothing: no attributes, no text, one child.
  const collapsible = (el) =>
    (el.localName === 'div' || el.localName === 'span') &&
    el.attributes.length === 0 &&
    el.childElementCount === 1 &&
    textOf(el) === '';

  const stats = { visited: 0, hidden: 0, truncated: false };

  const walk = (el, depth, parentSelector) => {
    if (stats.visited >= opts.max_visited) {
      stats.truncated = true;
      return null;
    }
    stats.visited++;
    const selector = selectorOf(el, parentSelector);
    if (collapsible(el)) return walkChild(el.firstElementChild, depth, selector);

    const node = { tag: el.localName, selector, attrs: attrsOf(el) };
    const text = textOf(el);
    if (text) {
      node.text = clip(text);
      node.text_len = Array.from(text).length;
    }
    if (LEAVES.has(el.localName) || wholeText(el) || el.isContentEditable) return node;
    if (depth >= opts.max_depth) {
      if (el.childElementCount) stats.truncated = true;
      return node;
    }

    // A collapsed <details> shows its summary and nothing else.
    const folded = el.localName === 'details' && !el.open;
    const shown = Array.from(el.children).filter((child) => {
      if (SKIPPED.has(child.localName)) return false;
      if (folded && child.localName !== 'summary') {
        stats.hidden++;
        return false;
      }
      if (!hidden(child) || keptThoughHidden(child)) return true;
      stats.hidden++;
      return false;
    });
    // Rows of a list look alike: keep the first few of each run and say how
    // many there were. Controls are all kept: the fifth button may be Save.
    const kind = (child) => child.localName + '.' + (child.classList[0] || '');
    const children = [];
    for (let i = 0; i < shown.length; ) {
      let end = i + 1;
      while (end < shown.length && kind(shown[end]) === kind(shown[i])) end++;
      const run = end - i;
      const kept = CONTROLS.has(shown[i].localName) ? run : Math.min(run, opts.max_repeats);
      for (let k = i; k < i + kept; k++) {
        const child = walk(shown[k], depth + 1, selector);
        if (child) {
          if (k === i && run > kept) child.repeats = run;
          children.push(child);
        }
      }
      i = end;
    }
    if (children.length) node.children = children;
    return node;
  };

  const walkChild = (el, depth, parentSelector) => {
    if (SKIPPED.has(el.localName)) return null;
    if (hidden(el) && !keptThoughHidden(el)) {
      stats.hidden++;
      return null;
    }
    return walk(el, depth, parentSelector);
  };

  const root = walk(document.body, 0, 'html') || { tag: 'body', selector: 'body', attrs: {} };
  return { url: location.href, title: document.title, root, stats };
}
