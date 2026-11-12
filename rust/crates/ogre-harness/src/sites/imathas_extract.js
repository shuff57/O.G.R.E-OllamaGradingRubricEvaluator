// Reads every student section on an IMathAS "grade all" page in one pass.
// Evaluated as an expression; the value is the JSON the Rust side decodes.
//
// Selectors follow the markup IMathAS emits in course/gradeallq2.php:
//   div.bigquestionwrap                 one per student
//   .headerpane b                       "Last, First"
//   .scoredetails input[name^="ud-"]    score box, name = ud-{userid}-{version}-{question}-{part}
//   text "/N" after each score box      points possible for that box
//   .scoredetails .fbbox                feedback: <textarea> or a rich-text <div>
//   div.introtext#qnwrap{n}             an essay answer shown for review
//   #stusel                             student picker, present in one-at-a-time mode
(() => {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Rendered math is an SVG with no readable text. Swap each one for its
  // spoken label so numbers in the question survive conversion to markdown.
  const htmlWithMathAsText = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach((m) => {
      if (!clone.contains(m)) return; // nested inside one already replaced
      const labelled = m.hasAttribute('aria-label') ? m : m.querySelector('[aria-label]');
      const label = labelled ? labelled.getAttribute('aria-label') : null;
      if (!label) return;
      const span = document.createElement('span');
      span.textContent = ' ' + label.replace(/,\s*math\s*$/, '').trim() + ' ';
      m.replaceWith(span);
    });
    return clone.innerHTML;
  };

  // The content div of the Nth part of a question. Multi-part questions wrap
  // each part in div.seqsepwrap alongside a hidden result and a heading.
  const partContent = (region, n) => {
    if (!region) return null;
    const part = region.querySelectorAll(':scope > div')[n];
    if (!part) return null;
    if (!part.classList.contains('seqsepwrap')) return part;
    return Array.from(part.children).find(
      (c) => c.tagName === 'DIV' && !c.classList.contains('seqscoreresult')
    ) || part;
  };

  const readScores = (section) =>
    Array.from(section.querySelectorAll('.scoredetails input[name^="ud-"]')).map((input) => {
      let max = null;
      for (let n = input.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === Node.ELEMENT_NODE && n.matches('input[name^="ud-"]')) break;
        if (n.nodeType !== Node.TEXT_NODE) continue;
        const m = n.textContent.match(/^\s*\/\s*(\d+(?:\.\d+)?)/);
        if (m) { max = Number(m[1]); break; }
      }
      return {
        field: input.name,
        label: input.getAttribute('aria-label') || '',
        raw: input.value,
        max,
      };
    });

  const readFeedback = (section) => {
    const box = section.querySelector('.scoredetails .fbbox');
    if (!box) return null;
    const plain = box.tagName === 'TEXTAREA';
    return {
      field: box.id,
      kind: plain ? 'textarea' : 'rich_text',
      text: plain ? box.value : squash(box.textContent),
    };
  };

  const readStudent = (section, index) => {
    const nameEl =
      section.querySelector('.headerpane b') ||
      section.querySelector(':scope > b');
    const person = section.querySelector('.scoredetails .person');
    const name =
      squash(nameEl && nameEl.textContent) ||
      squash(person && person.textContent).replace(/:$/, '');

    const scores = readScores(section);
    const idMatch = scores.length ? scores[0].field.match(/^ud-(\d+)-/) : null;

    const region = section.querySelector('[role="region"][aria-label^="Question"]');
    const part = partContent(region, 0);
    const promptEl = part ? part.children[0] : null;

    // IMathAS shows an essay answer for review as div.introtext#qnwrap{n}
    // (assess2/questions/answerboxes/EssayAnswerBox.php). Older pages lack
    // the id, so fall back to an essay container that is neither inside the
    // prompt nor inside a collapsed rubric. Position is never used: some
    // questions put a rubric block between the prompt and the answer, and
    // auto-graded questions have no essay answer at all.
    let responseEl = null;
    if (region) {
      responseEl =
        region.querySelector('div.introtext[id^="qnwrap"]') ||
        Array.from(region.querySelectorAll('div.introtext')).find(
          (el) => !el.closest('details') && !(promptEl && promptEl.contains(el))
        ) ||
        null;
    }

    // Only an essay question has the prompt-then-answer layout read here.
    let promptHtml = null;
    if (responseEl && promptEl && !promptEl.contains(responseEl)) {
      const clone = promptEl.cloneNode(true);
      clone.querySelectorAll('details').forEach((d) => d.remove());
      promptHtml = htmlWithMathAsText(clone);
    }

    return {
      index,
      student_id: idMatch ? idMatch[1] : null,
      name,
      scores,
      feedback: readFeedback(section),
      response_html: responseEl ? htmlWithMathAsText(responseEl) : '',
      prompt_html: promptHtml,
    };
  };

  const picker = document.querySelector('#stusel');
  const position = picker && picker.options.length
    ? { current: picker.selectedIndex + 1, total: picker.options.length }
    : null;

  return {
    url: location.href,
    title: document.title,
    position,
    // The site shows its sign-in form at the address that was asked for.
    sign_in: !!document.querySelector('input[type="password"]'),
    submissions: Array.from(document.querySelectorAll('div.bigquestionwrap')).map(readStudent),
  };
})()
