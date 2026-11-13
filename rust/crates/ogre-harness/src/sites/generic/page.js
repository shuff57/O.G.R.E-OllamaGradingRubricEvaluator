// Resolves a profile's page map against the live page. Every generic-site
// script is built on this, so reading, validating and writing can never
// disagree about which element is which.
// Called as a function with the page map (see profile.rs); returns helpers.
(map) => {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // Page text can hold half of a surrogate pair, which has no JSON form.
  const wellFormed = (s) => (typeof s.toWellFormed === 'function' ? s.toWellFormed() : s);

  const visible = (el) =>
    typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
      : el.getClientRects().length > 0;

  // { els, invalid }: a selector that is not valid CSS matches nothing.
  const query = (root, selector) => {
    try {
      return { els: Array.from(root.querySelectorAll(selector)), invalid: false };
    } catch (e) {
      return { els: [], invalid: true };
    }
  };

  const regex = (pattern) => {
    try {
      return new RegExp(pattern, 'i');
    } catch (e) {
      return null;
    }
  };

  // The student sections that are shown. A page without a section selector
  // shows one student, and the whole document is that student's section.
  const sections = () => {
    if (!map.student_section) {
      const all = [document.documentElement];
      return { invalid: false, matched: 1, shown: all, nested: 0 };
    }
    const found = query(document, map.student_section);
    const shown = found.els.filter(visible);
    const nested = shown.filter((a) => shown.some((b) => a !== b && a.contains(b))).length;
    return { invalid: found.invalid, matched: found.els.length, shown, nested };
  };

  // Text of an element as a reader sees it, leaving out form controls, editable
  // areas and the elements in `skip`.
  const textOf = (root, skip) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (/^(TEXTAREA|SELECT|SCRIPT|STYLE|TEMPLATE)$/.test(node.tagName)) return NodeFilter.FILTER_REJECT;
        if (node.isContentEditable || (skip && skip.includes(node))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      },
    });
    let out = '';
    while (walker.nextNode()) out += walker.currentNode.textContent + ' ';
    return squash(out);
  };

  const nameText = (el) => {
    if (el.tagName === 'SELECT') return squash(el.selectedOptions[0] ? el.selectedOptions[0].text : '');
    if (el.tagName === 'INPUT') return squash(el.value);
    return squash(el.textContent);
  };

  // A reference that finds the same box again later: its form name or id when
  // the page has exactly one such element, otherwise the student's position.
  const controlsNamed = (name) =>
    Array.from(document.getElementsByName(name)).filter((el) => el.type !== 'hidden');
  const withId = (id) => Array.from(document.querySelectorAll('#' + CSS.escape(id)));
  const fieldRef = (el, index) => {
    if (el.name && controlsNamed(el.name).length === 1) return 'name:' + el.name;
    if (el.id && withId(el.id).length === 1) return 'id:' + el.id;
    return 'nth:' + index;
  };

  // Finds the box a reference points at, and requires that the profile's
  // selector still picks that same box inside its student's section.
  const locate = (ref, selector, shown, what) => {
    const colon = ref.indexOf(':');
    const kind = ref.slice(0, colon);
    const key = ref.slice(colon + 1);
    if (kind === 'nth') {
      const section = shown[Number(key)];
      if (!section) return { error: `there is no student number ${Number(key) + 1} on the page any more` };
      const found = query(section, selector).els;
      if (found.length !== 1) return { error: `expected one ${what} for this student, found ${found.length}` };
      return { section, el: found[0] };
    }
    let found;
    if (kind === 'name') found = controlsNamed(key);
    else if (kind === 'id') found = withId(key);
    else return { error: `"${ref}" does not say which ${what} to use` };
    if (found.length !== 1) return { error: `expected one ${what} "${key}", found ${found.length}` };
    const el = found[0];
    const section = shown.find((s) => s.contains(el));
    if (!section) return { error: `the ${what} is not inside a student section` };
    const picked = query(section, selector).els;
    if (picked.length !== 1 || picked[0] !== el) {
      return { error: `the ${what} is no longer where the site profile says it is` };
    }
    return { section, el };
  };

  const studentName = (section) => {
    const found = query(section, map.student_name).els;
    return found.length === 1 ? nameText(found[0]) : null;
  };

  const scoreInputTypes = ['text', 'number', 'tel', 'search'];
  const scoreFacts = (el) => {
    const isInput = el.tagName === 'INPUT' && scoreInputTypes.includes(el.type);
    return {
      control: el.tagName === 'INPUT' ? `input type="${el.type}"` : el.tagName.toLowerCase(),
      is_input: isInput,
      writable: isInput && !el.disabled && !el.readOnly,
      shown: visible(el),
    };
  };

  // The TinyMCE editor that owns a box, if the page runs one on it.
  const tinyFor = (el) => {
    const tiny = window.tinymce;
    if (!el.id || !tiny || typeof tiny.get !== 'function') return null;
    try {
      return tiny.get(el.id) || null;
    } catch (e) {
      return null;
    }
  };

  // Editors that keep their own copy of the document. Changing the page under
  // them is silently undone or corrupts what they save.
  const foreignEditors = [
    ['.ck-editor__editable, .cke_editable', 'CKEditor'],
    ['.ql-editor', 'Quill'],
    ['.ProseMirror', 'ProseMirror'],
    ['[data-slate-editor]', 'Slate'],
    ['[data-lexical-editor]', 'Lexical'],
    ['.public-DraftEditor-content', 'Draft.js'],
  ];
  const foreignEditor = (el) => {
    for (const [selector, name] of foreignEditors) if (el.closest(selector)) return name;
    return null;
  };

  // How a feedback box takes input: { kind, editor, foreign, writable }.
  const feedbackFacts = (el) => {
    const editor = tinyFor(el);
    const plain = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text');
    if (editor) return { kind: 'rich_text', editor, foreign: null, writable: true };
    if (plain) return { kind: 'textarea', editor: null, foreign: null, writable: !el.disabled && !el.readOnly };
    if (el.isContentEditable) {
      return { kind: 'rich_text', editor: null, foreign: foreignEditor(el), writable: true };
    }
    return { kind: null, editor: null, foreign: null, writable: false };
  };

  const feedbackText = (el, facts) => {
    if (facts.kind === 'textarea') return el.value;
    if (facts.editor && el.tagName === 'TEXTAREA') return squash(facts.editor.getContent({ format: 'text' }));
    return squash(el.textContent);
  };

  // What is folded away in a collapsed <details> (a rubric, a model answer)
  // is not part of what is shown, so it is left out as well.
  const htmlOf = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, template').forEach((n) => n.remove());
    clone.querySelectorAll('details:not([open]) > :not(summary)').forEach((n) => n.remove());
    // Rendered math is an SVG with no readable text. Swap each one for its
    // spoken label so numbers survive conversion to markdown.
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

  // { html } or { text }, or { blocked: true } for a frame from another site.
  const contentOf = (el) => {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return { text: el.value };
    if (el.tagName !== 'IFRAME') return { html: htmlOf(el) };
    let body = null;
    try {
      body = el.contentDocument && el.contentDocument.body;
    } catch (e) {
      body = null;
    }
    return body ? { html: htmlOf(body) } : { blocked: true };
  };

  // The frame that holds a student's answer ("response") or question
  // ("prompt"), for the browser to read where this script may not. `index`
  // is the student's place among the sections shown.
  const contentFrame = (index, what) => {
    const selector = what === 'prompt' ? map.prompt : map.response;
    const section = sections().shown[index];
    if (!selector || !section) return null;
    const found = query(section, selector).els;
    return found.length === 1 && found[0].tagName === 'IFRAME' ? found[0] : null;
  };

  const firstNumber = (text, pattern) => {
    const match = text.match(pattern || /(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const value = Number(match[1] !== undefined ? match[1] : match[0]);
    return Number.isFinite(value) ? value : null;
  };

  // { value, count?, invalid? } for one student's score box.
  const maxScore = (section, box, apart) => {
    const rule = map.max_score;
    if (!rule) return null;
    if (rule.from === 'fixed') return { value: rule.value };
    const pattern = rule.pattern ? regex(rule.pattern) : null;
    if (rule.pattern && !pattern) return { value: null, invalid: true };
    if (rule.from === 'selector') {
      const found = query(section, rule.selector);
      if (found.invalid) return { value: null, invalid: true };
      if (found.els.length !== 1) return { value: null, count: found.els.length };
      const el = found.els[0];
      const text = el.tagName === 'INPUT' ? el.value : squash(el.textContent);
      return { value: firstNumber(text, pattern), count: 1 };
    }
    // nearby_text: the box's own label first, then the text around it.
    const labels = [box.getAttribute('aria-label'), box.getAttribute('title')];
    for (const label of labels) {
      const value = label ? firstNumber(label, pattern) : null;
      if (value !== null) return { value };
    }
    for (let node = box.parentElement; node; node = node.parentElement) {
      const value = firstNumber(textOf(node, apart), pattern);
      if (value !== null) return { value };
      if (node === section) break;
    }
    return { value: null };
  };

  // The shown buttons a button rule finds: { els, invalid }. A link counts
  // as a button when it is found by its label.
  const button = (rule) => {
    if (!rule) return { els: [], invalid: false };
    if (rule.by === 'selector') {
      const found = query(document, rule.selector);
      return { els: found.els.filter(visible), invalid: found.invalid };
    }
    const wanted = squash(rule.text).toLowerCase();
    const buttons = query(document, 'button, input[type="submit"], input[type="button"], [role="button"], a[href]').els;
    const label = (el) => squash(el.tagName === 'INPUT' ? el.value : el.textContent).toLowerCase();
    return { els: buttons.filter((el) => visible(el) && label(el) === wanted), invalid: false };
  };

  // The page's save button: { els, invalid }.
  const saveButton = () => button(map.save && map.save.button);

  // Whether a button can be pressed as it stands.
  const pressable = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true';

  // A button to another student, for inspect(): how many the rule finds and
  // whether the one it finds can be pressed.
  const stepFacts = (rule) => {
    if (!rule) return null;
    const found = button(rule);
    return {
      count: found.els.length,
      invalid: found.invalid,
      enabled: found.els.length === 1 && pressable(found.els[0]),
    };
  };

  // Everything the profile points at, for every student shown. Changes nothing.
  const inspect = () => {
    const found = sections();
    const one = (section, selector) => {
      const q = query(section, selector);
      return { count: q.els.length, invalid: q.invalid, el: q.els.length === 1 ? q.els[0] : null };
    };

    const students = found.shown.map((section, index) => {
      const name = one(section, map.student_name);
      const score = one(section, map.score_input);
      const response = one(section, map.response);
      const prompt = map.prompt ? one(section, map.prompt) : null;
      const feedback = map.feedback ? one(section, map.feedback.selector) : null;
      const apart = [name.el, response.el, prompt && prompt.el].filter(Boolean);

      const id =
        section.getAttribute('data-student-id') ||
        section.getAttribute('data-user-id') ||
        section.getAttribute('data-student') ||
        (section !== document.documentElement && section.id) ||
        null;

      const out = {
        index,
        student_id: id,
        name: { count: name.count, invalid: name.invalid, text: name.el ? wellFormed(nameText(name.el)) : '' },
        score: { count: score.count, invalid: score.invalid },
        max: null,
        feedback: null,
        response: { count: response.count, invalid: response.invalid },
        prompt: null,
      };
      if (score.el) {
        Object.assign(out.score, scoreFacts(score.el), {
          field: fieldRef(score.el, index),
          label: score.el.getAttribute('aria-label') || '',
          raw: 'value' in score.el ? String(score.el.value) : '',
        });
        out.max = maxScore(section, score.el, apart);
      }
      if (feedback) {
        out.feedback = { count: feedback.count, invalid: feedback.invalid };
        if (feedback.el) {
          const facts = feedbackFacts(feedback.el);
          Object.assign(out.feedback, {
            field: fieldRef(feedback.el, index),
            kind: facts.kind,
            foreign: facts.foreign,
            writable: facts.writable,
            text: wellFormed(feedbackText(feedback.el, facts)),
          });
          if (map.feedback.hidden_field) {
            const hidden = query(section, map.feedback.hidden_field);
            out.feedback.hidden = { count: hidden.els.length, invalid: hidden.invalid };
          }
        }
      }
      if (response.el) {
        const content = contentOf(response.el);
        if (content.html !== undefined) out.response.html = wellFormed(content.html);
        if (content.text !== undefined) out.response.text = wellFormed(content.text);
        out.response.blocked = !!content.blocked;
      }
      if (prompt) {
        out.prompt = { count: prompt.count, invalid: prompt.invalid };
        if (prompt.el) {
          const content = contentOf(prompt.el);
          if (content.html !== undefined) out.prompt.html = wellFormed(content.html);
          if (content.text !== undefined) out.prompt.text = wellFormed(content.text);
          out.prompt.blocked = !!content.blocked;
        }
      }
      return out;
    });

    let save = null;
    if (map.save) {
      const button = saveButton();
      const success = map.save.success;
      save = {
        count: button.els.length,
        invalid: button.invalid,
        success_invalid: !!success && query(document, success.selector).invalid,
        pattern_invalid: !!success && !!success.pattern && !regex(success.pattern),
      };
    }

    return {
      url: location.href,
      title: document.title,
      sections: {
        invalid: found.invalid,
        matched: found.matched,
        hidden: found.matched - found.shown.length,
        nested: found.nested,
      },
      students,
      save,
      next: stepFacts(map.next_student),
      previous: stepFacts(map.previous_student),
    };
  };

  return {
    map, squash, visible, query, regex, sections, locate, studentName, scoreFacts,
    feedbackFacts, button, pressable, saveButton, inspect, contentFrame, htmlOf,
  };
}
