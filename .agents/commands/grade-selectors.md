# MyOpenMath DOM Selectors Reference

Reference for the `gradeallq2.php` (**Grade all questions**) page. Use this file during the extraction phase and the fill/Quick Save phase of the grading workflow.

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

## Selector Reference

| Area | Element | Selector / DOM Path | Notes |
|------|---------|----------------------|-------|
| Student list | All student sections | `div[data-lastchange]` | Primary iteration target for extraction and filling |
| Student list | Student name | `div[data-lastchange] > b` | Text used for grading reports and resume matching |
| Question region | Question region | `div[role="region"][aria-label^="Question"]` | Shared region wrapper for both parts |
| Part 1 | Part 1 content div | `region.children[1]` | DOM-path access inside the extracted region |
| Part 1 | Question prompt | `region.children[1].children[0]` | Prompt block that also contains grading checklist details |
| Part 1 | Student response | `region.children[1].children[1]` | Main free-response content to grade |
| Part 1 | Grading checklist | `region.children[1].children[0] > details > div > tr` elements | Checklist rows live inside collapsed `<details>` |
| Part 2 | Part 2 content div | `region.children[3]` | Contains rubric targets and model response |
| Part 2 | Rubric targets | `region.children[3] > details > div > tr` elements | Category rows for rubric target extraction |
| Part 2 | Model response | `region.children[3] > details > div > last div` | Final explanatory block inside the rubric details container |
| Score area | Score input | `input[aria-label="Score"]` | Per-student score field |
| Score area | Max score | Text `/N` in the score input parent element | Parse with regex from surrounding text |
| Feedback area | Feedback display | `div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]` | Visible TinyMCE inline editor |
| Feedback area | Feedback hidden input | `input[type="hidden"][name^="fb-"]` | Hidden form value that must also be updated |
| Save controls | Quick Save button | `button:has-text("Quick Save")` or `button` with text `Quick Save` | Use after each batch of 5 |
| Save controls | Save Changes button | `button[type="submit"]` with text `Save Changes` | Full-page fallback save control |

## Extraction Pattern

| Goal | Pattern | Why it matters |
|------|---------|----------------|
| Read all students at once | One `evaluate()` / Playwriter extraction across `div[data-lastchange]` | Prevents repeated browser reads and preserves context budget |
| Read rubric from first student | Use the first question region as the shared rubric source | Rubric and point values are consistent across the page |
| Read collapsed rubric content | Query inside `<details>` without opening it visually | Rubric data is accessible even when collapsed |
| Read max score safely | Parse `/N` from the score input parent text | Works even when score limits are not separately labeled |

## Extraction Code Example

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

| Requirement | Pattern | Why |
|-------------|---------|-----|
| Visible feedback must update | Set `div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]` | This is what the user sees on screen |
| Submitted feedback must update | Set `input[type="hidden"][name^="fb-"]` | This is what the form submits/saves |
| Save reliability | Update both targets in the same write step | Setting only the visible editor can fail to persist feedback |

MyOpenMath uses TinyMCE inline editors for feedback. You must set **both** the visible `contenteditable` div **and** the hidden input, or the feedback will not save.

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

## Visual Fill Pattern

| Step | Action | Notes |
|------|--------|-------|
| 1 | Scroll the student section into view | User should see the page move |
| 2 | Brief pause (~300ms) | Helps visual trust during automated fill |
| 3 | Fill the score input | Use the per-student `input[aria-label="Score"]` |
| 4 | Set TinyMCE feedback using both targets | Visible `contenteditable` + hidden input |
| 5 | After each batch of 5, click **Quick Save** | Keeps grading progress durable |
