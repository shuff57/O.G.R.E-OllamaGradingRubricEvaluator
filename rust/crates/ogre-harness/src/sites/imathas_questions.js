// Lists the questions of the assignment this "grade all" page belongs to,
// from the assignment's Item Analysis page, which the grading page links to.
// Reads only; the Item Analysis page holds class figures, no student work.
//
// Returns [] when the page has no such link or the list cannot be read.
(async () => {
  const link = Array.from(document.querySelectorAll('a[href*="gb-itemanalysis2.php"]'))
    .find((a) => !a.closest('div.bigquestionwrap'));
  if (!link) return [];
  const qidOf = (url) => new URL(url, location.href).searchParams.get('qid');
  const here = qidOf(location.href);

  let html;
  try {
    const reply = await fetch(link.href, { credentials: 'same-origin' });
    if (!reply.ok) return [];
    html = await reply.text();
  } catch (e) {
    return [];
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const questions = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('a[href*="gradeallq2.php"]')) {
    // Resolved against the Item Analysis page, where the link was found.
    const url = new URL(a.getAttribute('href'), link.href);
    const qid = url.searchParams.get('qid');
    const row = a.closest('tr');
    if (!qid || !row || seen.has(qid)) continue;
    seen.add(qid);
    const cells = Array.from(row.cells);
    questions.push({
      number: squash(cells[0] && cells[0].textContent) || String(questions.length + 1),
      title: squash(cells[1] && cells[1].textContent),
      url: url.href,
      current: qid === here,
    });
  }
  return questions;
})()
