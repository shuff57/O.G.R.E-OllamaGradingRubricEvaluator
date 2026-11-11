// Reads the rubric a free-response question carries, from one student's copy.
// Called as a function with the student's position on the page.
//
// These questions keep their grading material in collapsed <details> blocks:
// a checklist table inside the prompt, and in the second part a table of
// rubric targets followed by a model response.
(studentIndex) => {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const htmlWithMathAsText = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach((m) => {
      if (!clone.contains(m)) return;
      const labelled = m.hasAttribute('aria-label') ? m : m.querySelector('[aria-label]');
      const label = labelled ? labelled.getAttribute('aria-label') : null;
      if (!label) return;
      const span = document.createElement('span');
      span.textContent = ' ' + label.replace(/,\s*math\s*$/, '').trim() + ' ';
      m.replaceWith(span);
    });
    return clone.innerHTML;
  };

  const partContent = (region, n) => {
    const part = region.querySelectorAll(':scope > div')[n];
    if (!part) return null;
    if (!part.classList.contains('seqsepwrap')) return part;
    return Array.from(part.children).find(
      (c) => c.tagName === 'DIV' && !c.classList.contains('seqscoreresult')
    ) || part;
  };

  // One table row is one category: its name in the first cell, its entries
  // as <label> (checklist) or <li> (targets) elements.
  const rows = (container, entrySelector, skipIdeal) =>
    Array.from(container.querySelectorAll('tr')).map((tr) => {
      const name = tr.querySelector('td') || tr.querySelector('b');
      return {
        category: squash(name && name.textContent),
        items: Array.from(tr.querySelectorAll(entrySelector))
          .filter((el) => !(skipIdeal && el.querySelector('.ideal-ans')))
          .map((el) => squash(el.textContent)),
      };
    });

  const section = document.querySelectorAll('div.bigquestionwrap')[studentIndex];
  if (!section) return null;
  const region = section.querySelector('[role="region"][aria-label^="Question"]');

  let checklistItems = [];
  let rubricItems = [];
  let modelText = null;
  let modelHtml = null;
  let promptHtml = [];

  if (region) {
    const part1 = partContent(region, 0);
    const promptEl = part1 ? part1.children[0] : null;

    const checklist = promptEl && promptEl.querySelector('details > div, details div');
    if (checklist) {
      checklistItems = rows(checklist, 'label', false).filter((r) => r.category || r.items.length);
    }
    if (!checklistItems.length) {
      for (const details of region.querySelectorAll('details')) {
        const summary = squash((details.querySelector('summary') || {}).textContent);
        if (summary.includes('Model Response')) continue;
        if (!summary.includes('Checklist') && !summary.includes('Rubric')) continue;
        const body = details.querySelector('div');
        if (!body) continue;
        const found = rows(body, 'label', false).filter((r) => r.category || r.items.length);
        if (found.length) { checklistItems = found; break; }
      }
    }

    const part2 = region.querySelectorAll(':scope > div')[1];
    const targets = part2 && part2.querySelector('details') && part2.querySelector('details').querySelector('div');
    if (targets) {
      rubricItems = rows(targets, 'li', true).filter((r) => r.items.length);
      const ideal = targets.querySelectorAll('.ideal-ans');
      if (ideal.length) {
        modelText = Array.from(ideal, (el) => squash(el.textContent)).join(' ');
      } else {
        const model = targets.querySelector('div');
        if (model) modelHtml = htmlWithMathAsText(model);
      }
    }

    if (promptEl) {
      const clone = promptEl.cloneNode(true);
      clone.querySelectorAll('details').forEach((d) => d.remove());
      const holder = document.createElement('div');
      holder.innerHTML = htmlWithMathAsText(clone);
      promptHtml = Array.from(holder.querySelectorAll(':scope > p, :scope > div > p'), (p) => p.outerHTML);
    }
    if (!promptHtml.length) {
      promptHtml = Array.from(region.querySelectorAll('p'))
        .filter((p) => !p.closest('details') && squash(p.textContent).length > 5)
        .map((p) => '<p>' + htmlWithMathAsText(p) + '</p>');
    }

    // Last resort for questions laid out differently: any table in a
    // collapsed block is taken as rubric targets.
    if (!checklistItems.length && !rubricItems.length) {
      for (const details of region.querySelectorAll('details')) {
        const body = details.querySelector('div');
        if (!body) continue;
        rubricItems = rubricItems.concat(
          Array.from(body.querySelectorAll('tr')).map((tr) => ({
            category: squash((tr.querySelector('b') || {}).textContent),
            items: Array.from(tr.querySelectorAll('li, label'), (el) => squash(el.textContent)),
          })).filter((r) => r.category || r.items.length)
        );
      }
    }
  }

  let maxScore = null;
  const scoreBoxes = section.querySelectorAll('.scoredetails input[name^="ud-"]');
  if (scoreBoxes.length) {
    let total = 0;
    let known = true;
    for (const input of scoreBoxes) {
      let max = null;
      for (let n = input.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === Node.ELEMENT_NODE && n.matches('input[name^="ud-"]')) break;
        if (n.nodeType !== Node.TEXT_NODE) continue;
        const m = n.textContent.match(/^\s*\/\s*(\d+(?:\.\d+)?)/);
        if (m) { max = Number(m[1]); break; }
      }
      if (max === null) known = false; else total += max;
    }
    if (known) maxScore = total;
  }

  return { promptHtml, checklistItems, rubricItems, modelText, modelHtml, maxScore };
}
