// Page-level operations that need no particular element.
// args: { op, ... }.
switch (args.op) {
  case 'scroll':
    window.scrollBy(args.x, args.y);
    return { scrollX: window.scrollX, scrollY: window.scrollY };

  case 'scrollToText': {
    var needle = String(args.text).toLowerCase();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      var trimmed = node.textContent ? node.textContent.trim() : '';
      if (trimmed.toLowerCase().indexOf(needle) !== -1 && node.parentElement) {
        node.parentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
        return { found: true, matched: trimmed.substring(0, 100) };
      }
    }
    return { found: false };
  }

  case 'readPage':
    return { text: (document.body.innerText || '').substring(0, args.max) };

  case 'readElement': {
    var el = args.ref ? byRef(args.ref) : null;
    if (!el) return { found: false };
    if (isPasswordLike(el)) return { found: true, password: true };
    var tag = el.tagName.toLowerCase();
    var isField = tag === 'input' || tag === 'textarea' || tag === 'select';
    var text = isField ? el.value : el.textContent;
    return { found: true, text: String(text == null ? '' : text).substring(0, args.max) };
  }

  case 'exists':
    try {
      return { exists: !!document.querySelector(args.selector) };
    } catch (e) {
      return { invalid: String((e && e.message) || e) };
    }

  // Whether `args.result` gives away what is typed in a password field. The
  // comparison happens here so the password itself never leaves the page.
  case 'leaksPassword': {
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (isPasswordLike(field) && field.value && args.result.indexOf(field.value) !== -1) return { leaks: true };
    }
    return { leaks: false };
  }

  case 'writeCodeMirror': {
    var target = byRef(args.ref);
    if (!target) return { success: false, error: 'Element not found: ' + args.selector };
    var inner = target.querySelector ? target.querySelector('.CodeMirror') : null;
    var cm = target.CodeMirror
      || (inner && inner.CodeMirror)
      || (target.parentElement && target.parentElement.CodeMirror)
      // CodeMirror hides the textarea it replaces and puts its editor right after it.
      || (target.nextElementSibling && target.nextElementSibling.CodeMirror);
    if (!cm) {
      return {
        success: false,
        error: 'No CodeMirror instance found on ' + args.selector + '. Is this a CodeMirror editor?'
      };
    }
    try {
      cm.setValue(args.value);
      cm.refresh();
      return { success: true, data: { lines: cm.lineCount() } };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  }

  default:
    return { error: 'Unknown operation: ' + args.op };
}
