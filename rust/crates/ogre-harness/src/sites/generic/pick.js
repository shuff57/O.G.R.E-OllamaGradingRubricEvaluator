// Lets the teacher point at one element of the page and gives a selector for
// it. Called as a function with { mode, section, seconds }:
//   mode "section": the block that repeats once per student. The selector is
//                   page-wide and matches every such block.
//   mode "inside":  something inside a student's block. The selector is to be
//                   looked up inside each block (`section`), so it must not
//                   name anything that belongs to one student.
//   mode "page":    one element of the whole page.
// Resolves with { selector } once something is clicked, or { selector: null }
// when Escape is pressed or `seconds` pass. The click that picks is swallowed:
// it does not reach the page. Nothing of the page is changed or read out.
(args) => new Promise((resolve) => {
  const { mode, section, seconds } = args;
  const esc = (s) => CSS.escape(s);
  // A class or name with a run of digits in it is likely one student's own.
  const shared = (word) => !/\d{2,}/.test(word);
  const partOf = (el) => {
    let part = el.localName;
    const cls = [...el.classList].find(shared);
    if (cls) part += '.' + esc(cls);
    return part;
  };
  // The nearest block around `el` that repeats on the page and holds
  // something to fill in: a student's name repeats too, and is not the block.
  const repeating = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const cls = [...node.classList].find(shared);
      if (!cls || !node.querySelector('input, textarea, select, [contenteditable]')) continue;
      const selector = node.localName + '.' + esc(cls);
      if (document.querySelectorAll(selector).length > 1) return selector;
    }
    return null;
  };
  // A path from `root` down to `el` that finds exactly `el` inside `root`,
  // as short as it can be made.
  const within = (root, el) => {
    const parts = [];
    for (let node = el; node && node !== root; node = node.parentElement) {
      let part = partOf(node);
      const twins = [...node.parentElement.children].filter((sib) => sib.matches(part));
      if (twins.length > 1) {
        const sameTag = [...node.parentElement.children].filter((s) => s.localName === node.localName);
        part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      const selector = parts.join(' > ');
      const found = root.querySelectorAll(selector);
      if (found.length === 1 && found[0] === el) return selector;
    }
    return parts.join(' > ');
  };
  const selectorFor = (el) => {
    if (mode === 'section') return repeating(el);
    if (mode === 'inside') {
      let root = null;
      try { root = section ? el.closest(section) : null; } catch (_) { root = null; }
      if (section && !root) return null;
      return within(root || document.body, el);
    }
    if (el.id && document.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
    return within(document.body, el);
  };

  const marker = document.createElement('div');
  marker.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #2d6a4f;' +
    'background:rgba(45,106,79,0.15);display:none';
  document.documentElement.appendChild(marker);
  const mark = (el) => {
    const box = el.getBoundingClientRect();
    marker.style.display = 'block';
    marker.style.left = box.left + 'px';
    marker.style.top = box.top + 'px';
    marker.style.width = box.width + 'px';
    marker.style.height = box.height + 'px';
  };
  let timer = null;
  const done = (selector) => {
    clearTimeout(timer);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mousedown', swallow, true);
    document.removeEventListener('mouseup', swallow, true);
    document.removeEventListener('keydown', onKey, true);
    marker.remove();
    resolve({ selector });
  };
  const swallow = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onMove = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el && el !== marker) mark(el);
  };
  const onClick = (event) => {
    swallow(event);
    const el = document.elementFromPoint(event.clientX, event.clientY) || event.target;
    done(selectorFor(el));
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      swallow(event);
      done(null);
    }
  };
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', swallow, true);
  document.addEventListener('mouseup', swallow, true);
  document.addEventListener('keydown', onKey, true);
  timer = setTimeout(() => done(null), seconds * 1000);
})
