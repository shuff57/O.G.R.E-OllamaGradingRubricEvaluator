// Small operations on an element the agent already resolved.
// args: { ref, op, text }.
var el = byRef(args.ref);
if (!el) return { ok: false, error: 'Element is no longer on the page' };

function hasFocus() {
  var active = document.activeElement;
  return !!active && (active === el || el.contains(active));
}
function selectContents() {
  if (typeof el.select === 'function') {
    el.select();
  } else {
    var range = document.createRange();
    range.selectNodeContents(el);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

switch (args.op) {
  // Used only when the element has no on-screen box to click.
  case 'click':
    el.click();
    return { ok: true };
  case 'focus':
    if (!hasFocus() && typeof el.focus === 'function') el.focus();
    return { ok: hasFocus(), password: isPasswordLike(document.activeElement) };
  case 'focused':
    return { ok: hasFocus(), password: isPasswordLike(document.activeElement) };
  case 'selectAll':
    selectContents();
    return { ok: true };
  case 'caretToEnd':
    if (el.isContentEditable) {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (typeof el.value === 'string') {
      // Number and email inputs have no caret API; they keep the click's position.
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
    }
    return { ok: true };
  case 'value':
    if (isPasswordLike(el)) return { ok: true };
    return {
      ok: true,
      value: txt(typeof el.value === 'string' ? el.value : el.textContent, 200)
    };
  default:
    return { ok: false, error: 'Unknown operation: ' + args.op };
}
