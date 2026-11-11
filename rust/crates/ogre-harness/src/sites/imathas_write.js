// Puts one student's score and feedback into the page's form. Saves nothing:
// the site only stores the form when its Quick Save or Save Changes runs.
// Called as a function with
//   { score: { field, expected, value }, feedback: null | { field, html, text } }.
(args) => {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const fail = (error, changed) => ({ ok: false, error, changed: !!changed });
  const setValue = (el, proto, value) => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
  };

  const boxes = Array.from(document.getElementsByName(args.score.field)).filter(
    (el) => el.tagName === 'INPUT' && el.type !== 'hidden'
  );
  if (boxes.length !== 1) {
    return fail(`expected one score box named ${args.score.field}, found ${boxes.length}`);
  }
  const box = boxes[0];
  if (box.value.trim() !== args.score.expected.trim()) {
    return fail(
      `the score changed on the page since it was read (was "${args.score.expected}", now "${box.value}")`,
      true
    );
  }
  const section = box.closest('div.bigquestionwrap');
  if (!section) return fail('the score box is not inside a student section');

  let fb = null;
  if (args.feedback) {
    fb = document.getElementById(args.feedback.field);
    if (!fb || !fb.classList.contains('fbbox')) return fail(`feedback box ${args.feedback.field} not found`);
    if (!section.contains(fb)) return fail('the score box and feedback box belong to different students');
  }

  box.scrollIntoView({ block: 'center' });
  box.focus();
  setValue(box, HTMLInputElement.prototype, args.score.value);
  box.dispatchEvent(new Event('blur', { bubbles: true }));

  let via = null;
  let feedbackText = null;
  if (fb) {
    if (fb.tagName === 'TEXTAREA') {
      setValue(fb, HTMLTextAreaElement.prototype, args.feedback.text);
      via = 'textarea';
      feedbackText = fb.value;
    } else {
      // What the feedback should read as, taken before the page re-renders any math in it.
      const probe = document.createElement('div');
      probe.innerHTML = args.feedback.html;
      feedbackText = squash(probe.textContent);

      const editor = window.tinymce && typeof window.tinymce.get === 'function' ? window.tinymce.get(fb.id) : null;
      if (editor) {
        // The rich text editor owns this box and the hidden field the form posts.
        editor.setContent(args.feedback.html);
        editor.save();
        if (typeof editor.setDirty === 'function') editor.setDirty(true);
        via = 'editor';
      } else {
        fb.innerHTML = args.feedback.html;
        const hidden = Array.from(document.getElementsByName(fb.id)).find((el) => el.type === 'hidden');
        if (hidden) hidden.value = args.feedback.html;
        fb.dispatchEvent(new Event('input', { bubbles: true }));
        via = 'dom';
      }
      fb.classList.remove('skipmathrender');
      try {
        if (typeof window.rendermathnode === 'function') window.rendermathnode(fb);
      } catch (e) { /* display only */ }
    }
  }

  return { ok: true, via, score: box.value, feedback_text: feedbackText };
}
