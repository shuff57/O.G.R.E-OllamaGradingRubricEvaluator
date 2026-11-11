// Clicks Quick Save and waits for the site to say what happened.
// Called as a function with a timeout in milliseconds; returns a promise.
//
// The site's quicksave() posts the whole form, then shows "Saved" in
// #quicksavenotice for two seconds, or the server's error text.
(timeoutMs) => new Promise((resolve) => {
  const button = document.querySelector('#quicksavebtn');
  if (!button) return resolve({ ok: false, error: 'Quick Save button not found on the page' });
  const notice = document.querySelector('#quicksavenotice');
  if (!notice) return resolve({ ok: false, error: 'the page has no save status area to confirm the save' });

  const started = Date.now();
  let sawSaving = false;
  button.click();
  const tick = () => {
    const text = notice.textContent.replace(/\s+/g, ' ').trim();
    if (/^saved$/i.test(text)) return resolve({ ok: true });
    if (/saving/i.test(text)) {
      sawSaving = true;
    } else if (text) {
      return resolve({ ok: false, error: `the site answered: ${text}` });
    } else if (sawSaving) {
      return resolve({ ok: false, error: 'the save ended without a confirmation from the site' });
    }
    if (Date.now() - started > timeoutMs) {
      return resolve({ ok: false, error: 'timed out waiting for the site to confirm the save' });
    }
    setTimeout(tick, 50);
  };
  tick();
})
