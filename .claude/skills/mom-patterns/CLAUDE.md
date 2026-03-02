# MyOpenMath Question Patterns Library

> **Auto-populated by `mom-fact-finder`**. Load via `load_skills=["mom-patterns"]` to access discovered patterns.
> Do NOT edit manually — use `mom-fact-finder` with `refresh=true` to update a topic.

**Last Updated**: 2026-03-02  
**Total Entries**: 3  
**Line Count**: ~210 (cap: 800)

---

## How This File Works

1. **Loaded by question-writing skills** via `load_skills=["mom-patterns"]` to get real-world examples before writing.
2. **Updated by `mom-fact-finder`** after each browser search session.
3. **Library-first**: `mom-fact-finder` checks here before launching the browser — if a topic exists and `refresh=false`, it returns the cached pattern.
4. **Size-capped at 800 lines**: When adding a new entry would exceed the cap, the oldest/least-used section is compressed to a 3-line summary first.

---

## Size Policy

- **Hard cap**: 800 lines total. Per-section max: 150 lines.
- **Compression**: Oldest sections (by "Added" date) get condensed to a 3-line summary when cap is approached.
- **Format**: `## [Topic] (summarized)` / metadata line / key insight sentence / `---`

## Entry Format Template

Each pattern entry MUST follow this exact structure:

```markdown
## [Topic Name]
**Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678, #9012 | **Times Used (max)**: 6591
**Question Types**: essay, multipart | **Libraries**: `datasummary`, `stats`

### Key Patterns
- [Pattern bullet 1 — what these questions do that mom-frq doesn't document]
- [Pattern bullet 2]
- [Pattern bullet 3]
- [Pattern bullet 4 — optional]
- [Pattern bullet 5 — optional]

### Best Code Example (QID #1234, N uses)
\`\`\`php
[Best single code example, truncated to 80 lines for control, 40 lines for qtext]
\`\`\`

### Extracted Function Calls
- `loadlibrary('name')` — description of what it provides
- [other functions found]

---
```


## Topic Index

1. [Statistics Essay / FRQ](#statistics-essay--frq)
2. [Regression Analysis Essay](#regression-analysis-essay)
3. [Regression Analysis Multipart (Auto-graded)](#regression-analysis-multipart-auto-graded)

---

<!-- PATTERNS -->

<!-- TEMPLATE - REPLACE WITH REAL DATA -->
## Hypothesis Testing FRQ (TEMPLATE)
**Added**: 0000-00-00 | **Sources**: QID #00000, #00001 | **Times Used (max)**: 0
**Question Types**: essay | **Libraries**: `stats`

### Key Patterns
- Uses `loadlibrary('datasummary')` to provide sample statistics for the prompt
- `$displayformat[0]="editornopaste"` prevents copy-paste to enforce original writing
- Rubric uses `$scoremethod[0]="essayrubric"` with explicit point breakdown in qtext
- Question text includes a data table rendered via HTML in `$qtext`

### Best Code Example (QID #00000, 0 uses)
```php
// TEMPLATE PLACEHOLDER — replace with real extracted code
```

### Extracted Function Calls
- `loadlibrary('stats')` — statistical functions (mean, sd, norm tables)

---
<!-- END TEMPLATE -->

## Statistics Essay / FRQ
**Added**: 2026-03-01 | **Sources**: QID #58134, #620020, #58991 | **Times Used (max)**: 1446
**Question Types**: essay | **Libraries**: *(none required)*

### Key Patterns
- `$answer` as a plain string = model/ideal response for open-ended essay questions
- `getfeedbacktxtessay($stuanswers[$thisq], 'model answer')` provides post-submission feedback to students
- `$scoremethod = 'takeanything'` is standard for FRQ — no auto-scoring, manual grading expected
- `$hidetips = true` hides MOM standard hints for written-response questions
- `showdataarray(array(...), numCols)` renders an inline data table directly in question text

### Best Code Example (QID #620020, 300 uses)
```php
$scoremethod = "takeanything"
$hidetips = true
$fb = getfeedbacktxtessay($stuanswers[$thisq],"Answers will vary. Here are a few possible reasons:
<ul>
  <li>It would take too long to survey an entire population</li>
  <li>It may be impossible to contact every member</li>
</ul>")
```

### Extracted Function Calls
- `getfeedbacktxtessay($stuanswers[$thisq], 'html feedback')` — feedback after submission
- `showdataarray(array('label','value',...), ncols)` — renders a data table in qtext
- `$scoremethod = 'takeanything'` — accepts any response (manual grading)
- `$scoremethod = 'singlescore'` — used when essay is one part of a multipart question

---

## Regression Analysis Essay
**Added**: 2026-03-01 | **Sources**: QID #860343, #860461, #860481 | **Times Used (max)**: 48
**Question Types**: essay | **Libraries**: lib476 (Correlation/regression, Statistics)

### Key Patterns
- **No PHP control code** — entire question lives in `$qtext` only (pure HTML)
- Data presented as `<table border="1">` with 2 rows: variable label + 9 numeric data values
- Standard **8-part a–h structure** (all three questions use the identical sub-question sequence):
  - (a) Null and alternative hypothesis
  - (b) Test statistic and p-value
  - (c) Conclusion of hypothesis test in context
  - (d) Equation of the regression line
  - (e) Interpret the slope in context
  - (f) Interpret the y-intercept in context (or explain why not relevant)
  - (g) Use the regression line to predict a specific value
  - (h) Interpret `r^2` in context
- Real-world context: paired quantitative variables with relatable scenarios
- **Not randomized** — fixed datasets; no PHP randomization
- **Empty answer field, empty scoremethod** — pure manual grading, no auto-scoring
- Backtick math used for r²: `` `r^2` ``
- 9 data points is standard; intro phrase: “A researcher is looking at the relationship between X and Y”

### Best Code Example (QID #860343, 48 uses)
```html
<!-- control: (empty — no PHP needed) -->

<!-- qtext: -->
<p>Suppose a study was done to look at the relationship between the number of hours per week online statistics students put into the class and their GPA.&nbsp; The results are shown below.</p>
<table border="1">
<tbody>
<tr>
  <td style="width: 72px;">Hours</td>
  <td>18</td><td>4</td><td>14</td><td>8</td><td>10</td><td>20</td><td>15</td><td>6</td><td>2</td>
</tr>
<tr>
  <td style="width: 72px;">GPA</td>
  <td>3.9</td><td>2.1</td><td>3.3</td><td>2.7</td><td>2.9</td><td>3.5</td><td>3.4</td><td>2.2</td><td>1.3</td>
</tr>
</tbody>
</table>
<p>a.&nbsp; &nbsp;Write down the null and alternative hypothesis.</p>
<p>b.&nbsp; Write down the test statistic and the p-value.</p>
<p>c.&nbsp; State the conclusion of the hypothesis test in the context of the study</p>
<p>d.&nbsp; Write down the equation of the regression line.</p>
<p>e.&nbsp; Interpret the slope of the regression line in the context of the study.</p>
<p>f.&nbsp; Interpret the y-intercept of the regression line in the context of the study or explain why it is not relevant.</p>
<p>g.&nbsp; Use the regression line to predict the GPA of a student who puts in 13 hours a week for their online statistics class.</p>
<p>h.&nbsp; Interpret `r^2`&nbsp;&nbsp; in the context of the study.&nbsp;</p>
```

### Extracted Function Calls
*(none — qtext-only question, no PHP functions used)*

---

## Regression Analysis Multipart (Auto-graded)
**Added**: 2026-03-02 | **Sources**: QID #1781982, #1747766 | **Times Used (max)**: 1
**Question Types**: multipart | **Libraries**: `stats`

### Key Patterns
- `linreg($xarr, $yarr)` returns **`[r, slope, intercept]`** — indices 0, 1, 2 respectively. r² = `$reg[0]*$reg[0]`. **NOT** `[slope, intercept, r]`.
- Use `$anstypes = array("number","number","number","choices","choices")` to mix number boxes and dropdowns
- Direction dropdown: `$questions[n] = array(...)` + `$answer[n] = $dir_idx` + `$displayformat[n] = "select"` + `$noshuffle[n] = "all"` (to keep Positive/Negative/None in fixed order)
- r² interpretation dropdown: correct answer at index 0 (`$answer[4] = 0`), `$displayformat[4] = "select"` (auto-shuffles wrong answers)
- `diffrands(min, max, n)` for distinct x-values; `rrand(lo, hi, step)` for bounded random with step
- Build data table via string concatenation in a for loop, wrap in `<table border="1">` inline HTML
- `$abstolerance[n]` for numeric parts: slope ±0.005, intercept ±0.01, prediction ±0.1
- Randomized context via parallel arrays (`$xnames`, `$ynames`, `$x_pred_labels`) indexed by `$ci = rand(0, n-1)`

### Best Code Example (QID #1781982, pipeline test)
```php
loadlibrary("stats");

$ci = rand(0,2);
$xnames = array("hours studied per week","daily calories consumed","months of experience");
$ynames = array("exam score","weight (lbs)","hourly wage ($)");
$x_preds = array(14, 2500, 24);
$x_pred_labels = array("a student who studies 14 hours per week","someone who consumes 2500 calories per day","an employee with 24 months of experience");
$xname = $xnames[$ci]; $yname = $ynames[$ci];
$x_pred = $x_preds[$ci]; $x_pred_label = $x_pred_labels[$ci];

$n = 8;
$true_m = rrand(1.5, 3.5, 0.5);
$true_b = rand(20, 50);
$xarr = diffrands(2, 12, $n);
for ($k = 0..$n-1) {
  $xdata[$k] = $xarr[$k];
  $ydata[$k] = round($true_m * $xarr[$k] + $true_b + rrand(-3,3,0.5), 1);
}

$reg = linreg($xdata, $ydata);
// linreg returns: [0]=r, [1]=slope, [2]=intercept
$r   = round($reg[0], 4);
$m   = round($reg[1], 3);
$b_i = round($reg[2], 3);
$r2  = round($r*$r, 4);
$r2pct = round($r2*100, 1);
$y_pred = round($m*$x_pred + $b_i, 1);

$anstypes = array("number","number","number","choices","choices");
$answer[0] = $m;      $abstolerance[0] = 0.005;
$answer[1] = $b_i;    $abstolerance[1] = 0.01;
$answer[2] = $y_pred; $abstolerance[2] = 0.1;

$dir_idx = 0 if ($m > 0); $dir_idx = 1 if ($m < 0);
$questions[3] = array(
  "Positive - as $xname increases, $yname tends to increase",
  "Negative - as $xname increases, $yname tends to decrease",
  "None - no linear relationship exists"
);
$answer[3] = $dir_idx; $displayformat[3] = "select"; $noshuffle[3] = "all";

$r2_c  = "$r2pct% of the variation in $yname is explained by the linear relationship with $xname";
$r2_w1 = "$r2pct% of data points fall exactly on the regression line";
$r2_w2 = "The correlation coefficient r equals $r2pct";
$r2_w3 = "There is a $r2pct% chance the regression is statistically significant";
$questions[4] = array($r2_c, $r2_w1, $r2_w2, $r2_w3);
$answer[4] = 0; $displayformat[4] = "select";

$row1 = "<tr><td style=\"font-weight:bold;padding:6px;\">$xname</td>";
$row2 = "<tr><td style=\"font-weight:bold;padding:6px;\">$yname</td>";
for ($k = 0..$n-1) {
  $row1 .= "<td style=\"padding:6px;\">$xdata[$k]</td>";
  $row2 .= "<td style=\"padding:6px;\">$ydata[$k]</td>";
}
$datatable = "<table border=\"1\" cellpadding=\"4\" style=\"border-collapse:collapse;margin:10px 0;\"><tbody>$row1</tr>$row2</tr></tbody></table>";
```

### Extracted Function Calls
- `loadlibrary("stats")` — provides `linreg()`, `diffrands()`, `rrand()`, `rand()`
- `linreg($x, $y)` → `[r, slope, intercept]` — **indices 0,1,2**
- `diffrands(min, max, n)` — array of n distinct integers in [min, max]
- `rrand(lo, hi, step)` — random float with given step size

---


