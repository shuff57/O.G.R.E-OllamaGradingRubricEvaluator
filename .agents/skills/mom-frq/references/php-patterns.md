# MOM PHP Patterns Reference

> Detailed code patterns for MyOpenMath (IMathAS) question authoring.
> This is a reference file — no YAML frontmatter. Loaded by the `mom-frq` skill.

---

## 1. QUESTION TYPE → ANSWER SETUP

| If asking for... | $anstypes value | Key variables |
|-----------------|-----------------|---------------|
| A number | `"number"` | `$answer = 42` |
| An algebraic expression | `"numfunc"` | `$answer = "2*x+3"` |
| Multiple-choice | `"choices"` | `$questions = array(...)`, `$answer = 0` |
| Select all correct | `"multans"` | `$questions = array(...)`, `$answers = "0,2"` |
| Point or vector | `"ntuple"` | `$answer = "(3,4)"` |
| Matrix of numbers | `"matrix"` | `$answer`, `$answersize = "2,3"` |
| Interval notation | `"interval"` | `$answer = "[2,5)"` |
| Written explanation | `"essay"` | `$displayformat[0]="editornopaste"` |
| File upload | `"file"` | `$scoremethod[i]="takeanything"`, `$answerformat[i]="images,.pdf"` |
| Multiple types | Array of above | `$anstypes = array("number","essay")` |

---

## 2. ESSAY QUESTION PATTERN

```php
// Basic essay (teacher grades)
$anstypes = array("essay");
$displayformat[0] = "editornopaste";   // ALWAYS this, not "editor"
$scoremethod[0] = "takeanything";      // teacher manually grades

// Essay question text
$qtext = "Explain in complete sentences: Why does the Central Limit Theorem matter?";
$qtext .= getfeedbacktxtessay("Use specific examples from class.");
```

---

## 3. MULTIPART PATTERN (number + essay)

```php
// Part (a): numeric; Part (b): essay
$anstypes = array("number","essay");
$answer[0] = $a * $b;                  // auto-graded
$scoremethod[1] = "takeanything";      // teacher grades essay
$displayformat[1] = "editornopaste";

$qtext = "A car travels at \($a\) mph for \($b\) hours.<br><br>" .
         "(a) Calculate the distance: \$answerbox[0]<br><br>" .
         "(b) Explain the distance formula: \$answerbox[1]";
```

---

## 4. RANDOMIZERS

```php
rand(2,8)                // integer in [2,8]
rrand(1,8,2)             // real with 2 decimal places
nonzerorand(-5,5)        // nonzero integer
diffrands(-5,5,2)        // 2 distinct integers → $a,$b = diffrands(-5,5,2)
randsfrom(array(2,3,5,7), 2)  // 2 items from list (may repeat)
diffrandsfrom(array(2,3,5,7), 2)  // 2 DISTINCT items from list

// Conditional randomization (retry until condition met):
$a,$b = diffrands(-5,5,2) where ($a+$b != 0)
{ $a = rand(-5,-1); $b = rand(1,5) } where ($a+$b != 0) else { $a=-3; $b=5 }
```

---

## 5. SCORING METHODS

| $scoremethod value | When to use |
|-------------------|-------------|
| `""` (default) | Auto-graded numeric/function answer |
| `"takeanything"` | Accept any answer — teacher grades manually |
| `"essayrubric"` | Display rubric for essay; teacher grades via rubric |
| `"singlescore"` | All parts correct for any credit |
| `"allornothing"` | For multiple-choice: all or nothing |
| `"answers"` | Partial credit by correct answer count |
| `"byelement"` | Partial credit by element (matrix, ntuple) |

---

## 6. RANDOMIZATION PATTERNS (diffrands, where)

```php
// Distinct coefficients for quadratic
$a,$b,$c = diffrands(1,9,3)  // 3 distinct integers

// Where clause — prevent bad cases
$a,$b = diffrands(2,8,2) where (gcd($a,$b)==1)  // coprime

// Named people
$name = randname()         // random name
$namewp = randnamewpronouns()  // sets $name,$heshe,$himher,$hisher

// Pick from a set
$topic = randfrom(array("mean","median","mode"))
```

---

## 7. LOADLIBRARY CALLS

```php
loadlibrary("stats");         // statistics functions
loadlibrary("algebra");       // polynomial/matrix algebra
loadlibrary("calculus");      // calculus functions
loadlibrary("finance");       // financial functions
loadlibrary("linearalgebra"); // linear algebra
loadlibrary("chemistry");     // chemistry/stoichiometry
loadlibrary("physics");       // physics constants/formulas
```

See `mom-lib-map` skill for complete function listings per library.

---

## 8. FORMAT MACROS

```php
// Display-ready polynomial: "3+-2x" → "3-2x"
makepretty("$a+$b")
polymakepretty("$a*x^2+0*x+$c")   // removes 0*x terms
makexxpretty("1*x^2+0*x+3")        // aggressive cleanup

// Numbers
prettyint(1234567)          // → "1,234,567"
prettyreal(1234.567, 2)     // → "1,234.57"
dispreducedfraction(3,6)    // → "1/2"

// Signs
sign($a)           // → "+" or "-"
sign($a,"onlyneg") // → "-" or ""

// Inline conditional text in $qtext:
// [if sign==positive]The value is positive.[/if]
```

---

## 9. ESSAY FEEDBACK HELPER

```php
getfeedbacktxtessay("Scoring guidance text for the student")
// Returns HTML block showing: "Note: This is an essay question. [guidance text]"
// Append to $qtext after the question prompt
```

---

## 10. COMMON PATTERNS BY SUBJECT

### Statistics Essay Pattern
```php
loadlibrary("stats");
$n = rand(15,40);
$mean = rrand(50,90,1);
$sd = rrand(5,20,1);

$anstypes = array("essay");
$displayformat[0] = "editornopaste";
$scoremethod[0] = "takeanything";

$qtext = "A sample of \($n\) students scored with mean \($mean\) and " .
         "standard deviation \($sd\).<br><br>" .
         "Interpret what these statistics tell us about this class's performance.";
$qtext .= getfeedbacktxtessay("Address both the mean and spread. Use complete sentences.");
```

### Algebra Multipart with Essay
```php
loadlibrary("algebra");
$a = rand(2,8);
$b = rand(1,6);
$c = $a * $b;    // product for a factoring question

$anstypes = array("numfunc","essay");
$answer[0] = "$a*x+$b";
$scoremethod[1] = "takeanything";
$displayformat[1] = "editornopaste";

$qtext = "Consider the equation \($a x + $b = " . ($a*3+$b) . "\).<br><br>" .
         "(a) Solve for \(x\): \$answerbox[0]<br><br>" .
         "(b) Describe each step of your solution process: \$answerbox[1]";
```

### File Upload Pattern
```php
$anstypes = array("file");
$scoremethod[0] = "takeanything";
$answerformat[0] = "images,.pdf";

$qtext = "Upload a photo of your handwritten work showing " .
         "the calculation for this problem.";
```

---

## 11. LATEX MATH IN QTEXT

```
\( inline math \)          → inline math (use for formulas in sentences)
\[ display math \]         → centered display equation
\( \frac{a}{b} \)         → fraction
\( x^{2} \)               → exponent
\( \sqrt{x} \)            → square root
\( \sum_{i=1}^{n} \)      → summation
```

**Pitfalls:**
- Use `$$` → WRONG in MOM. Use `\( \)` instead.
- Em dashes (—) → WRONG. Use hyphen (-) instead.
- Negative values in expressions: `$b = "($a)^2"` not `"$a^2"` when $a could be negative.
