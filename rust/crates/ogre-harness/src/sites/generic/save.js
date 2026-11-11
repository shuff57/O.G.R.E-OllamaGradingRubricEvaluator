// Clicks the profile's save button and waits for the page's own confirmation.
// Called as a function with the helpers from page.js and a timeout in
// milliseconds; returns a promise.
//
// A confirmation left on screen by an earlier save does not count: it has to
// appear, or be written again, after the click.
(page, timeoutMs) => new Promise((resolve) => {
  const rule = page.map.save;
  const fail = (error) => resolve({ ok: false, error });
  if (!rule || !rule.success) return fail('the site profile has no way to recognize a finished save');

  const pattern = rule.success.pattern ? page.regex(rule.success.pattern) : null;
  if (rule.success.pattern && !pattern) return fail('the save confirmation pattern is not a valid regular expression');
  if (page.query(document, rule.success.selector).invalid) return fail('the save confirmation selector is not valid CSS');

  const button = page.saveButton();
  if (button.invalid) return fail('the save button selector is not valid CSS');
  if (button.els.length !== 1) return fail(`expected one save button on the page, found ${button.els.length}`);
  if (button.els[0].disabled) return fail('the save button is disabled');

  const shown = () => page.query(document, rule.success.selector).els.filter(page.visible);
  const confirmations = () => shown().filter((el) => !pattern || pattern.test(page.squash(el.textContent)));

  const stale = new Set(confirmations());
  let rewritten = false;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const old of stale) if (old === record.target || old.contains(record.target)) rewritten = true;
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  const finish = (outcome) => {
    observer.disconnect();
    resolve(outcome);
  };

  const started = Date.now();
  button.els[0].click();
  const tick = () => {
    const now = confirmations();
    if (now.some((el) => !stale.has(el)) || (rewritten && now.length)) return finish({ ok: true });
    if (Date.now() - started > timeoutMs) {
      const seen = shown().map((el) => page.squash(el.textContent)).filter(Boolean).join(' / ');
      return finish({
        ok: false,
        error: 'timed out waiting for the site to confirm the save' + (seen ? `; it shows "${Array.from(seen).slice(0, 200).join('')}"` : ''),
      });
    }
    setTimeout(tick, 50);
  };
  tick();
})
