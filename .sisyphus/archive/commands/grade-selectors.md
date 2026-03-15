# MyOpenMath DOM Selectors Reference

Reference for the `gradeallq2.php` ("Grade all questions") page. Read this when implementing Steps 2 and 4 of the grading workflow.

## Page Structure Per Student

```
form
└── div[data-lastchange]                    ← Student section
    ├── b                                   ← Student name
    ├── div[role="region"][aria-label^="Question"]  ← Question area
    │   ├── p.seqsep[role="heading"]        ← "Part 1 of 2"
    │   ├── div                             ← Part 1 content
    │   │   ├── div                         ← Question prompt + grading checklist (<details>)
    │   │   ├── div                         ← STUDENT RESPONSE (grade this)
    │   │   └── span                        ← (empty)
    │   ├── p.seqsep[role="heading"]        ← "Part 2 of 2"
    │   └── div                             ← Part 2: rubric targets + model response
    └── div.scoredetails                    ← Score/feedback area
        ├── input[aria-label="Score"]       ← Score input
        ├── a.fullcredlink                  ← "Full credit" quick link
        ├── div.fbbox[contenteditable]      ← Feedback display (TinyMCE inline)
        └── input[type="hidden"][name^="fb-"]  ← Feedback value (must set this too)
```

## Selector Quick Reference

| Element | Selector |
|---------|----------|
| All student sections | `div[data-lastchange]` |
| Student name | `div[data-lastchange] > b` |
| Question region | `div[role="region"][aria-label^="Question"]` |
| Part 1 content div | `region.children[1]` |
| Question prompt | `region.children[1].children[0]` |
| Student response | `region.children[1].children[1]` |
| Grading checklist | `region.children[1].children[0]` > `details` > `div` > `tr` elements |
| Part 2 content div | `region.children[3]` |
| Rubric targets | `region.children[3]` > `details` > `div` > `tr` elements |
| Model response | `region.children[3]` > `details` > `div` > last `div` |
| Score input | `input[aria-label="Score"]` |
| Max score | Text `/N` in score input's parent element |
| Feedback display | `div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]` |
| Feedback hidden input | `input[type="hidden"][name^="fb-"]` |
| Quick Save button | `button:has-text("Quick Save")` or `button` with text "Quick Save" |
| Save Changes button | `button[type="submit"]` with text "Save Changes" |

## Extraction Code Example

This JavaScript runs inside a browser `evaluate()` call to extract all data in one pass:

```javascript
const students = Array.from(document.querySelectorAll('div[data-lastchange]'));
const first = students[0];
const firstRegion = first.querySelector('div[role="region"]');
const part1Div = firstRegion.children[1];
const promptDiv = part1Div.children[0];
const part2Div = firstRegion.children[3];

// Grading checklist (collapsed <details> in Part 1)
const checkDiv = promptDiv.querySelector('details')?.querySelector('div');
const checklistItems = checkDiv
  ? Array.from(checkDiv.querySelectorAll('tr')).map(tr => ({
      category: tr.querySelector('b')?.textContent.trim() || '',
      items: Array.from(tr.querySelectorAll('label')).map(l => l.textContent.trim())
    })).filter(x => x.category || x.items.length)
  : [];

// Rubric targets and model response (collapsed <details> in Part 2)
const rubDiv = part2Div?.querySelector('details')?.querySelector('div');
const rubricItems = rubDiv
  ? Array.from(rubDiv.querySelectorAll('tr')).map(tr => ({
      category: tr.querySelector('b')?.textContent.trim() || '',
      items: Array.from(tr.querySelectorAll('li')).map(l => l.textContent.trim())
    })).filter(x => x.category || x.items.length)
  : [];
const modelText = rubDiv?.querySelector('div')?.textContent.trim() || null;

// Essay prompt
const promptPs = promptDiv.querySelectorAll(':scope > p, :scope > div > p');
const essayPrompt = Array.from(promptPs).map(p => p.textContent.trim()).join(' ').substring(0, 500);

// Max score from score input parent text
const scoreInput = first.querySelector('input[aria-label="Score"]');
const maxMatch = scoreInput.parentElement.textContent.match(/\/(\d+\.?\d*)/);
const maxScore = maxMatch ? maxMatch[1] : '10';

// All student data in one pass
const studentData = students.map((s, i) => {
  const region = s.querySelector('div[role="region"]');
  const responseDiv = region?.children[1]?.children[1];
  return {
    index: i,
    name: s.querySelector('b').textContent.trim(),
    currentScore: s.querySelector('input[aria-label="Score"]').value,
    hasFeedback: (s.querySelector('div.fbbox[role="textbox"]')?.textContent.trim().length || 0) > 0,
    response: responseDiv?.textContent.trim() || ''
  };
});

return {
  rubric: { essayPrompt, checklistItems, rubricItems, modelText, maxScore },
  students: studentData
};
```

## TinyMCE Feedback Pattern

MyOpenMath uses TinyMCE inline editors for feedback. You must set BOTH the visible contenteditable div AND the hidden form input, or the feedback will not save.

```javascript
// Inside a browser evaluate() call:
const student = document.querySelectorAll('div[data-lastchange]')[studentIndex];
const fbBox = student.querySelector('div.fbbox[role="textbox"]');
const hidden = student.querySelector('input[type="hidden"][name^="fb-"]');
const html = '<p>' + feedbackText + '</p>';

if (fbBox) {
  fbBox.innerHTML = html;
  fbBox.dispatchEvent(new Event('input', { bubbles: true }));
}
if (hidden) {
  hidden.value = html;
}
```

**Why both?** The contenteditable div is what the user sees. The hidden input is what the form submits. TinyMCE normally syncs them, but when setting innerHTML directly, the sync doesn't fire. Setting both ensures the feedback persists after save.

## Visual Interaction Pattern

For each student in a fill batch, the agent should:
1. Scroll the student section into view (user sees page movement)
2. Brief pause (~300ms) for visual feedback
3. Fill the score input
4. Set feedback via the TinyMCE pattern above
