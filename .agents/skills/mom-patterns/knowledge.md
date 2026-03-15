# MyOpenMath Question Patterns Library

> Auto-populated by `mom-fact-finder` and read by `mom-frq` before drafting new questions.
> Use `load_skills=["mom-patterns"]` to access this library.
> Do not hand-edit topic content without new source evidence; use `mom-fact-finder` refresh/append updates.

**Last Updated**: 2026-03-15  
**Total Entries**: 3  
**Line Cap**: 800

---

## How This File Works

1. `mom-frq` reads this file before writing to reuse real-world MOM patterns.
2. `mom-fact-finder` appends new topic entries here or refreshes stale ones.
3. If a topic already exists and `refresh=false`, reuse the cached entry instead of re-researching it.
4. When the file approaches the 800-line cap, compress the oldest or least-used full entry to the required summary form before adding more detail.

## Size Policy

- **Hard cap**: 800 lines total. Per-section max: 150 lines.
- **Compression trigger**: Before any addition or refresh that would push the file over the cap.
- **Compression rule**: Convert the oldest or least-used full entry into this summary form:

```markdown
## [Topic Name] (summarized)
**Added**: YYYY-MM-DD | **Sources**: QID #1234 | **Times Used (max)**: 999
[One sentence capturing the durable pattern insight.]
---
```

## Entry Format Template

````markdown
## [Topic Name]
**Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678, #9012 | **Times Used (max)**: 999
**Question Types**: essay, multipart | **Libraries**: `datasummary`, `stats`

### Key Patterns
- [Pattern bullet 1 — what these questions do that mom-frq does not already document]
- [Pattern bullet 2]
- [Pattern bullet 3]

### Best Code Example (QID #1234, N uses)
```php
[Best single code example, trimmed to the essential pattern]
```

### Extracted Function Calls
- `loadlibrary('name')` — description of what it provides

---
````

## Topic Index

1. [Statistics Essay / FRQ](#statistics-essay--frq)
2. [Regression Analysis Essay](#regression-analysis-essay)
3. [Regression Analysis Multipart (Auto-graded)](#regression-analysis-multipart-auto-graded)

---

## Statistics Essay / FRQ
**Added**: 2026-03-01 | **Sources**: QID #58134, #620020, #58991 | **Times Used (max)**: 1446
**Question Types**: essay | **Libraries**: *(none required)*

### Key Patterns
- `$answer` as a plain string acts as the model response for open-ended essay questions.
- `getfeedbacktxtessay($stuanswers[$thisq], 'model answer')` provides post-submission feedback to students.
- `$scoremethod = 'takeanything'` is standard for FRQ: no auto-scoring, manual grading expected.
- `$hidetips = true` hides MOM standard hints for written-response questions.
- `showdataarray(array(...), numCols)` renders an inline data table directly in question text.

### Best Code Example (QID #620020, 300 uses)
```php
$scoremethod = "takeanything";
$hidetips = true;
$fb = getfeedbacktxtessay($stuanswers[$thisq],"Answers will vary. Here are a few possible reasons:
<ul>
  <li>It would take too long to survey an entire population</li>
  <li>It may be impossible to contact every member</li>
</ul>");
```

### Extracted Function Calls
- `getfeedbacktxtessay($stuanswers[$thisq], 'html feedback')` — feedback after submission
- `showdataarray(array('label','value',...), ncols)` — renders a data table in qtext
- `$scoremethod = 'takeanything'` — accepts any response for manual grading
- `$scoremethod = 'singlescore'` — used when an essay is one part of a multipart question

---

## Regression Analysis Essay
**Added**: 2026-03-01 | **Sources**: QID #860343, #860461, #860481 | **Times Used (max)**: 48
**Question Types**: essay | **Libraries**: lib476 (Correlation/regression, Statistics)

### Key Patterns
- No PHP control code: the entire question lives in `$qtext` only as pure HTML.
- Data appears in a `<table border="1">` with two rows: variable label plus nine numeric data values.
- Standard 8-part a–h structure repeats across all archived examples: hypotheses, test statistic/p-value, conclusion, regression line, slope, intercept, prediction, and `r^2` interpretation.
- Real-world context uses paired quantitative variables in relatable scenarios.
- The questions are not randomized: fixed datasets, no PHP randomization.
- Empty answer field plus empty scoremethod means pure manual grading.
- Backtick math is used for r²: `` `r^2` ``.
- Nine data points are standard; opening phrase often begins with “Suppose a study was done to look at the relationship between X and Y”.

### Best Code Example (QID #860343, 48 uses)
```html
<p>Suppose a study was done to look at the relationship between the number of hours per week online statistics students put into the class and their GPA. The results are shown below.</p>
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
<p>a. Write down the null and alternative hypothesis.</p>
<p>b. Write down the test statistic and the p-value.</p>
<p>c. State the conclusion of the hypothesis test in the context of the study.</p>
<p>d. Write down the equation of the regression line.</p>
<p>e. Interpret the slope of the regression line in the context of the study.</p>
<p>f. Interpret the y-intercept of the regression line in the context of the study or explain why it is not relevant.</p>
<p>g. Use the regression line to predict the GPA of a student who puts in 13 hours a week for their online statistics class.</p>
<p>h. Interpret `r^2` in the context of the study.</p>
```

### Extracted Function Calls
- *(none — qtext-only question, no PHP functions used)*

---

## Regression Analysis Multipart (Auto-graded)
**Added**: 2026-03-02 | **Sources**: QID #1781982, #1747766 | **Times Used (max)**: 1
**Question Types**: multipart | **Libraries**: `stats`

### Key Patterns
- `linreg($xarr, $yarr)` returns `[r, slope, intercept]` in indices 0, 1, 2 respectively; `r^2` is `$reg[0] * $reg[0]`.
- Use `$anstypes = array("number","number","number","choices","choices")` to mix numeric boxes and dropdowns.
- Direction dropdown pattern: `$questions[n] = array(...)`, `$answer[n] = $dir_idx`, `$displayformat[n] = "select"`, and `$noshuffle[n] = "all"`.
- `r^2` interpretation dropdown keeps the correct answer at index 0 with `$displayformat[4] = "select"`.
- `diffrands(min, max, n)` generates distinct x-values; `rrand(lo, hi, step)` generates bounded random values on a step.
- Build the data table by string concatenation in a loop and wrap it in a rounded-corner outer `<div>` because `border-radius` on `<table>` is unreliable.
- Numeric tolerances are narrow: slope ±0.005, intercept ±0.01, prediction ±0.1.
- Randomized contexts come from parallel arrays indexed by a single random context selector.

### Best Code Example (QID #1781982, pipeline test)
```php
loadlibrary("stats");

$ci = rand(0,2);
$xnames = array("hours studied per week","daily calories consumed","months of experience");
$ynames = array("exam score","weight (lbs)","hourly wage ($)");
$x_preds = array(14, 2500, 24);
$x_pred_labels = array("a student who studies 14 hours per week","someone who consumes 2500 calories per day","an employee with 24 months of experience");
$xname = $xnames[$ci];
$yname = $ynames[$ci];
$x_pred = $x_preds[$ci];
$x_pred_label = $x_pred_labels[$ci];

$n = 8;
$true_m = rrand(1.5, 3.5, 0.5);
$true_b = rand(20, 50);
$xarr = diffrands(2, 12, $n);
for ($k = 0; $k < $n; $k++) {
  $xdata[$k] = $xarr[$k];
  $ydata[$k] = round($true_m * $xarr[$k] + $true_b + rrand(-3,3,0.5), 1);
}

$reg = linreg($xdata, $ydata);
$r = round($reg[0], 4);
$m = round($reg[1], 3);
$b_i = round($reg[2], 3);
$r2 = round($r*$r, 4);
$r2pct = round($r2*100, 1);
$y_pred = round($m*$x_pred + $b_i, 1);

$anstypes = array("number","number","number","choices","choices");
$answer[0] = $m;      $abstolerance[0] = 0.005;
$answer[1] = $b_i;    $abstolerance[1] = 0.01;
$answer[2] = $y_pred; $abstolerance[2] = 0.1;

$dir_idx = 0;
if ($m < 0) { $dir_idx = 1; }
$questions[3] = array(
  "Positive - as $xname increases, $yname tends to increase",
  "Negative - as $xname increases, $yname tends to decrease",
  "None - no linear relationship exists"
);
$answer[3] = $dir_idx;
$displayformat[3] = "select";
$noshuffle[3] = "all";
```

### Extracted Function Calls
- `loadlibrary("stats")` — provides `linreg()`, `diffrands()`, `rrand()`, and related helpers
- `linreg($x, $y)` → `[r, slope, intercept]` — indices `0, 1, 2`
- `diffrands(min, max, n)` — array of `n` distinct integers in `[min, max]`
- `rrand(lo, hi, step)` — random float with a fixed step size

---
