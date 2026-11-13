// Presses the button to the next or the previous student. Called as a
// function with the helpers from page.js and "next" or "previous".
//
// Returns at once, before the page has changed: pressing the button may load
// a new page, which would end a script that waited. Rust watches for the
// other student to appear.
(page, which) => {
  const rule = which === 'next' ? page.map.next_student : page.map.previous_student;
  if (!rule) return { pressed: false, reason: 'the site profile maps no such button' };
  const found = page.button(rule);
  if (found.invalid) return { pressed: false, reason: 'the button\'s selector is not valid CSS' };
  if (found.els.length === 0) return { pressed: false, reason: 'the button is not on the page' };
  if (found.els.length > 1) return { pressed: false, reason: `the rule finds ${found.els.length} buttons` };
  if (!page.pressable(found.els[0])) return { pressed: false, reason: 'the button is disabled' };
  found.els[0].click();
  return { pressed: true };
}
