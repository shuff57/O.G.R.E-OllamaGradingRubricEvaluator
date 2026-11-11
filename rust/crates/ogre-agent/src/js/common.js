// Helpers shared by every script the agent runs in the page. `args` is defined
// by the wrapper built in script.rs.

// Elements the agent has shown to the AI, by ref. Kept on the page so a ref
// names the same element for as long as the document lives, and stops
// resolving once the document is replaced.
function registry() {
  var key = '__ogreAgentRefs';
  var reg = window[key];
  if (!reg) {
    reg = { next: args.nextRef || 1, byRef: new Map(), byEl: new WeakMap() };
    Object.defineProperty(window, key, { value: reg, configurable: true, enumerable: false });
  }
  if (args.nextRef && args.nextRef > reg.next) reg.next = args.nextRef;
  return reg;
}

function refFor(el) {
  var reg = registry();
  var ref = reg.byEl.get(el);
  if (!ref) {
    ref = 'e' + reg.next++;
    reg.byEl.set(el, ref);
    reg.byRef.set(ref, new WeakRef(el));
  }
  return ref;
}

function byRef(ref) {
  var reg = window.__ogreAgentRefs;
  var weak = reg && reg.byRef.get(ref);
  var el = weak ? weak.deref() : null;
  return el && el.isConnected ? el : null;
}

function txt(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().substring(0, max);
}

function isVisible(el) {
  var style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  var rect = el.getBoundingClientRect();
  return rect.width !== 0 && rect.height !== 0;
}

// A field whose contents must never be read or typed: a password input, or
// one that is a password in all but its `type` (a "show password" toggle
// switches the type to text).
function isPasswordLike(el) {
  if (!el || !el.tagName) return false;
  var tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return false;
  if ((el.getAttribute('type') || '').toLowerCase() === 'password') return true;
  var autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (/(current|new)-password|one-time-code/.test(autocomplete)) return true;
  var names = [el.id, el.getAttribute('name'), el.getAttribute('aria-label'), el.getAttribute('placeholder')]
    .join(' ')
    .toLowerCase();
  return /passwor|passwd|passcode|passphrase/.test(names);
}

function labelOf(el) {
  var parts = [];
  var aria = el.getAttribute('aria-label');
  if (aria) parts.push(aria);
  var labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    labelledBy.split(/\s+/).forEach(function (id) {
      var node = document.getElementById(id);
      if (node) parts.push(node.textContent);
    });
  }
  if (el.labels) {
    for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent);
  }
  var title = el.getAttribute('title');
  if (title) parts.push(title);
  return txt(parts.join(' '), 100);
}

function matchesOnly(selector, el) {
  try {
    var found = document.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch (e) {
    return false;
  }
}

function quoted(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// A CSS selector that matches this element and nothing else.
function getSelector(el) {
  var tag = el.tagName.toLowerCase();
  if (el.id) {
    var byId = '#' + CSS.escape(el.id);
    if (matchesOnly(byId, el)) return byId;
  }
  var name = el.getAttribute('name');
  if (name) {
    var byName = tag + '[name=' + quoted(name) + ']';
    if (matchesOnly(byName, el)) return byName;
  }
  var semantic = ['data-testid', 'aria-label', 'data-id', 'data-cy'];
  for (var i = 0; i < semantic.length; i++) {
    var value = el.getAttribute(semantic[i]);
    if (value) {
      var byAttr = tag + '[' + semantic[i] + '=' + quoted(value) + ']';
      if (matchesOnly(byAttr, el)) return byAttr;
    }
  }
  if (typeof el.className === 'string' && el.className.trim()) {
    var classes = el.className.trim().split(/\s+/).slice(0, 3).map(function (c) { return CSS.escape(c); });
    var byClass = tag + '.' + classes.join('.');
    if (matchesOnly(byClass, el)) return byClass;
  }
  // Position among siblings, up to the nearest ancestor with a unique id.
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node !== el && node.id) {
      var anchor = '#' + CSS.escape(node.id);
      if (matchesOnly(anchor, node)) {
        parts.unshift(anchor);
        break;
      }
    }
    var nth = 1;
    var sibling = node;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName === node.tagName) nth++;
    }
    parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + nth + ')');
    node = node.parentElement;
  }
  return parts.join(' > ');
}

// What the agent knows about an element. `full` adds the facts the approval
// rules need. A password field's value is never included.
function describe(el, full) {
  var tag = el.tagName.toLowerCase();
  var password = isPasswordLike(el);
  var isField = tag === 'input' || tag === 'textarea' || tag === 'select';
  var type;
  if (tag === 'summary') {
    type = el.parentElement && el.parentElement.hasAttribute('open') ? 'expanded' : 'collapsed';
  } else if (typeof el.type === 'string' && el.type) {
    type = el.type;
  }
  var buttonLike = tag === 'input' && /^(submit|button|reset|image)$/.test(type || '');
  var toggle = tag === 'input' && /^(checkbox|radio)$/.test(type || '');
  var text = isField ? (buttonLike ? txt(el.value || el.getAttribute('alt'), 100) : '') : txt(el.textContent, 100);

  var value;
  if (isField && !password && !buttonLike && !toggle && type !== 'hidden' && type !== 'file') {
    if (tag === 'select') {
      var option = el.options && el.options[el.selectedIndex];
      value = txt(option ? option.text : '', 80);
    } else {
      value = txt(el.value, 80);
    }
  }

  var classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 8) : [];
  var href = typeof el.href === 'string' && el.href ? el.href.substring(0, 300) : undefined;

  var info = {
    tag: tag,
    type: type,
    id: el.id || undefined,
    name: el.getAttribute('name') || undefined,
    placeholder: el.getAttribute('placeholder') || undefined,
    text: text,
    value: value,
    href: href,
    label: labelOf(el) || undefined,
    role: el.getAttribute('role') || undefined,
    disabled: !!el.disabled,
    editable: !!el.isContentEditable,
    password: password,
    checked: toggle ? !!el.checked : undefined,
    classes: classes.length ? classes : undefined
  };
  if (full) {
    var form = el.form || (el.closest ? el.closest('form') : null);
    info.inForm = !!form;
    info.formAction = form && typeof form.action === 'string' ? form.action.substring(0, 300) : undefined;
    info.onclick = txt(el.getAttribute('onclick'), 200) || undefined;
    info.readOnly = !!el.readOnly;
    info.inputMode = (el.getAttribute('inputmode') || '').toLowerCase() || undefined;
    // A frame or a shadow root holds controls this script cannot see.
    info.opaque = /^(iframe|frame|object|embed)$/.test(tag) || !!el.shadowRoot;
    if (!password) {
      info.empty = isField ? el.value === '' : txt(el.textContent, 1) === '';
    }
  }
  return info;
}
