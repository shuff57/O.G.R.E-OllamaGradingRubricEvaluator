import { evalScript } from './browser';

export const SELECTOR_LABELS: Record<string, string> = {
  studentSection: 'Student Section',
  studentName: 'Student Name',
  scoreInput: 'Score Input',
  feedbackBox: 'Feedback Area',
  feedbackHidden: 'Feedback Hidden Input',
  questionRegion: 'Question Region',
  fullCreditLink: 'Full Credit Link',
};

export async function highlightSelector(selector: string) {
  if (!selector) return;
  try {
    await evalScript(`(function(selector) {
      document.querySelectorAll('[data-ogre-refine-highlight]').forEach(function(el) {
        el.style.outline = el.dataset.ogreOriginalOutline || '';
        el.style.outlineOffset = el.dataset.ogreOriginalOutlineOffset || '';
        el.removeAttribute('data-ogre-refine-highlight');
        el.removeAttribute('data-ogre-original-outline');
        el.removeAttribute('data-ogre-original-outline-offset');
      });
      if (!selector) return;
      try {
        var matches = document.querySelectorAll(selector);
        for (var i = 0; i < matches.length; i++) {
          var el = matches[i];
          el.dataset.ogreOriginalOutline = el.style.outline || '';
          el.dataset.ogreOriginalOutlineOffset = el.style.outlineOffset || '';
          el.style.outline = '3px dashed #f59e0b';
          el.style.outlineOffset = '2px';
          el.setAttribute('data-ogre-refine-highlight', 'true');
        }
      } catch(e) {}
    })(${JSON.stringify(selector)})`);
  } catch {
    // Non-fatal — webview may not be ready
  }
}

export async function clearRefinementHighlights() {
  try {
    await evalScript(`(function() {
      document.querySelectorAll('[data-ogre-refine-highlight]').forEach(function(el) {
        el.style.outline = el.dataset.ogreOriginalOutline || '';
        el.style.outlineOffset = el.dataset.ogreOriginalOutlineOffset || '';
        el.removeAttribute('data-ogre-refine-highlight');
        el.removeAttribute('data-ogre-original-outline');
        el.removeAttribute('data-ogre-original-outline-offset');
      });
    })()`);
  } catch {}
}
