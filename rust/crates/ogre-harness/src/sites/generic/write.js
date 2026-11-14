// Puts one student's score and feedback into the page's form. Saves nothing.
// Called as a function with the helpers from page.js and
//   { name, score: { field, expected, value }, feedback: null | { field, html, text } }.
//
// Every check runs before anything is changed, so a refused write leaves the
// page exactly as it was.
(page, args) => {
  const { map, squash } = page;
  const fail = (error) => ({ ok: false, error });
  const setValue = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
  };

  const found = page.sections();
  if (found.nested) return fail('the student sections on the page overlap');

  const score = page.locate(args.score.field, map.score_input, found.shown, 'score box');
  if (score.error) return fail(score.error);
  const box = score.el;
  const section = score.section;

  // The box is found by where it is. The name proves it is still this student's.
  const name = page.studentName(section);
  if (name === null || name !== squash(args.name)) {
    return fail('the page now shows a different student where this one was');
  }
  const facts = page.scoreFacts(box);
  if (!facts.is_input) return fail(`the score box is a ${facts.control}, not a text or number box`);
  if (!facts.writable) return fail('the score box is read-only');
  if (box.value.trim() !== args.score.expected.trim()) {
    return fail(`the score changed on the page since it was read (was "${args.score.expected}", now "${box.value}")`);
  }

  let fb = null;
  let how = null;
  let hidden = null;
  if (args.feedback) {
    if (!map.feedback) return fail('the site profile maps no feedback box');
    const located = page.locate(args.feedback.field, map.feedback.selector, found.shown, 'feedback box');
    if (located.error) return fail(located.error);
    if (located.section !== section) return fail('the score box and feedback box belong to different students');
    fb = located.el;
    how = page.feedbackFacts(fb);
    if (!how.kind) return fail('the feedback box is not something that can be typed into');
    if (how.foreign) return fail(`the feedback box belongs to ${how.foreign}, an editor OGRE cannot write through`);
    if (!how.writable) return fail('the feedback box is read-only');
    if (how.kind === 'rich_text' && !how.editor && map.feedback.hidden_field) {
      const fields = page.query(section, map.feedback.hidden_field).els;
      if (fields.length !== 1) return fail(`expected one hidden feedback field for this student, found ${fields.length}`);
      hidden = fields[0];
    }
  }

  // A site that saves by itself does so when a box is left. A script
  // cannot move the real focus about without a visible page, so the events
  // of leaving are sent as well.
  const leave = (el) => {
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    if (map.saving === 'as_typed') el.dispatchEvent(new Event('focusout', { bubbles: true }));
  };

  box.scrollIntoView({ block: 'center' });
  box.focus();
  setValue(box, args.score.value);
  leave(box);

  let via = null;
  let feedbackText = null;
  if (fb) {
    if (how.kind === 'textarea') {
      // A one-line box drops line breaks without leaving a space behind.
      const text = fb.tagName === 'INPUT' ? args.feedback.text.replace(/\s*\n+\s*/g, ' ') : args.feedback.text;
      setValue(fb, text);
      if (map.saving === 'as_typed') leave(fb);
      via = 'textarea';
      feedbackText = fb.value;
    } else {
      // What the feedback should read as, taken before the page re-renders anything in it.
      const probe = document.createElement('div');
      probe.innerHTML = args.feedback.html;
      feedbackText = squash(probe.textContent);
      if (how.editor) {
        // The editor owns this box and the field the form posts.
        how.editor.setContent(args.feedback.html);
        how.editor.save();
        if (typeof how.editor.setDirty === 'function') how.editor.setDirty(true);
        via = 'editor';
      } else {
        fb.innerHTML = args.feedback.html;
        if (hidden) hidden.value = args.feedback.html;
        fb.dispatchEvent(new Event('input', { bubbles: true }));
        if (map.saving === 'as_typed') leave(fb);
        via = 'dom';
      }
    }
  }

  return { ok: true, via, score: box.value, feedback_text: feedbackText };
}
