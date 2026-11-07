// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractStudents, DEFAULT_MYOPENMATH_PROFILE } from './batch-grader';

// Run the injected page scripts against the jsdom document instead of a real webview.
vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(async (script: string) => (0, eval)(script)),
  injectScript: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./markdown-extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./markdown-extract')>();
  return { ...actual, ensureTurndownLoaded: vi.fn().mockResolvedValue(undefined) };
});

const selectors = DEFAULT_MYOPENMATH_PROFILE.selectors;

function student(name: string, questionBody: string): string {
  return `
    <div data-lastchange="10/21/26, 2:36 pm">
      <div class="headerpane"><b>${name}</b></div>
      <div class="question" role="region" aria-label="Question 501">
        ${questionBody}
        <div class="autoshowans"><div><i>This solution is for a similar problem</i></div></div>
      </div>
      <input aria-label="Score" value="0"><span>/14</span>
    </div>`;
}

describe('extractStudents - MyOpenMath response location', () => {
  beforeEach(() => {
    (Element.prototype as any).scrollIntoView = () => {};
  });

  it('reads the typed answer when a rubric block sits between prompt and response', async () => {
    document.body.innerHTML = student(
      'Arnold, Emily',
      `<div>
         <div><p>Set up and find the probability of that event.</p></div>
         <style>.x{}</style>
         <div class="frq2"><div class="rubric-container"><details><summary>Click to View Grading Checklist</summary><div>RUBRIC TEXT</div></details></div></div>
         <div><div class="introtext" id="qnwrap501000"><p>There are 312 equally likely outcomes.</p></div></div>
       </div>`
    );
    const [s] = await extractStudents(selectors);
    expect(s.response).toContain('312 equally likely outcomes');
    expect(s.response).not.toContain('RUBRIC TEXT');
  });

  it('still reads the response as the second direct div when there is no introtext', async () => {
    document.body.innerHTML = student(
      'Chavera, Karly',
      `<div>
         <div><p>Explain your reasoning for this problem.</p></div>
         <div><p>My plain answer.</p></div>
       </div>`
    );
    const [s] = await extractStudents(selectors);
    expect(s.response).toContain('My plain answer.');
  });
});
