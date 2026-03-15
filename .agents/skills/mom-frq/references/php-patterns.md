# MyOpenMath FRQ PHP Patterns

Use this reference when the main `mom-frq` skill needs exact MyOpenMath / IMathAS syntax examples.

## 1. Core essay and scoring patterns

### Essay-only FRQ
```php
$anstypes = array("essay");
$displayformat[0] = "editornopaste";
```

### Score-method choices
```php
$scoremethod = "takeanything";
$scoremethod[0] = "essayrubric";
$scoremethod = "singlescore";
```

- `takeanything` = standard manual-grading FRQ pattern
- `essayrubric` = rubric-based essay scoring setup
- `singlescore` = multipart question scored as one combined item

### Essay feedback helper
```php
$scoremethod = "takeanything";
$hidetips = true;
$fb = getfeedbacktxtessay($stuanswers[$thisq],"Answers will vary. Here are a few possible reasons:<ul><li>Reason 1</li><li>Reason 2</li></ul>");
```

## 2. `loadlibrary()` patterns

```php
loadlibrary("stats");
loadlibrary("matrix");
loadlibrary("polys");
loadlibrary("fractions");
loadlibrary("interval");
loadlibrary("stats,matrix");
```

Use library loads only when the code calls helpers from those libraries.

## 3. Randomization patterns

### Single values
```php
$a = rand(1,9);
$b = nonzerorand(-5,5);
$p = rrand(0.2,0.8,0.05);
$name = randname();
```

### Distinct values
```php
$x0,$y0 = nonzerodiffrands(-4,4,2);
$a,$b = diffrands(-5,5,2);
$vals = diffrrands(-2,2,0.5,3);
```

### Constrained generation
```php
$a,$b = diffrands(-5,5,2) where ($a+$b != 0);
$a = rand(1,9) where (gcd($a,$b)==1) else ($a = 1);
{ $a = rand(-5,-1); $b = rand(1,5) } where ($a+$b != 0) else { $a=-3; $b=5 };
```

### Context arrays
```php
$contexts = array("scenario A","scenario B","scenario C");
$i = rand(0, count($contexts)-1);
$topic = $contexts[$i];

$values = array(0.60, 0.85, 0.40);
$val = $values[$i];
```

## 4. qtext HTML construction

### Minimal question text
```php
$questiontext = '<div style="font-family:Arial;font-size:medium;line-height:1.6;">'
  . '<p>Scenario: '.$topic.'</p>'
  . '<p><b>Essay Prompt:</b><br>Explain your reasoning.</p>'
  . '<ul><li>Point 1</li><li>Point 2</li></ul>'
  . $rubricbutton
  . '</div>';
```

### Interpolation pitfall
```php
$a = -4;
$bad = "$a^2";     // gives -4^2
$good = "($a)^2";  // correct grouping
```

### Arrays inside strings
```php
$ar = array(3,4);
$txt = "{$ar[0]} items";
```

## 5. FRQ scaffold

```php
loadlibrary("stats");

$anstypes = array("essay");
$displayformat[0] = "editornopaste";

$r_step1 = "first step description";
$r_step2 = "second step description";
$sample_narrative = "Model answer: <b>$r_step1</b>. Then <b>$r_step2</b>.";

$css_block = '<style>
  .rubric-container { width:100%; font-family:Arial; font-size:medium; margin:1em 0; }
  .rubric-container details { width:100%; border:1px solid #ccc; border-radius:8px; overflow:hidden; background:#fff; }
  .rubric-container summary { cursor:pointer; display:block; width:100%; background:#f8f8f8; color:#333; padding:0.35em 0.6em; font-weight:bold; border-bottom:1px solid #ccc; list-style:none; border:none; }
  .rubric-content { overflow:hidden; max-height:0; opacity:0; transition:max-height 300ms ease-out, opacity 300ms ease-out, padding 200ms ease-out; margin-top:0; background:#fafafa; box-sizing:border-box; padding:0 0.75em; }
  .rubric-container details[open] .rubric-content { max-height:2000px; opacity:1; padding:0.75em; }
  .ideal-ans { display:block; background-color:#e8f5e9; font-style:italic; font-weight:bold; font-size:0.95em; margin:5px 0 10px 0; border-left:3px solid #4CAF50; padding-left:8px; }
</style>';

$rubricbutton = $css_block . '
<div class="rubric-container">
  <details>
    <summary>Click to View Grading Checklist</summary>
    <div class="rubric-content">
      <ul style="list-style:none;margin:0;padding-left:0;">
        <li><label><input type="checkbox"> Requirement text.</label></li>
      </ul>
    </div>
  </details>
</div>';

$rubricanswerbutton = $css_block . '
<div class="rubric-container">
  <details>
    <summary>Rubric &amp; Model Response</summary>
    <div class="rubric-content">
      <ul style="list-style:none;margin:0;padding-left:0;">
        <li>Requirement.
            <span class="ideal-ans">Target: "ideal answer text"</span></li>
      </ul>
      <div class="full-response-box">'.$sample_narrative.'</div>
    </div>
  </details>
</div>';

$questiontext = '<div style="font-family:Arial;font-size:medium;line-height:1.6;">'
  . '<p>Scenario: '.$topic.'</p>'
  . '<p><b>Essay Prompt:</b><br>Explain...</p>'
  . $rubricbutton
  . '</div>';

// $questiontext
// $answerbox[0]
// ///
// $rubricanswerbutton
```

### FRQ anti-patterns
- Never use `$displayformat[0] = "editor"`
- Never put model answers in `$rubricbutton`
- Keep student checklist and instructor targets separate
- Prefer randomized context arrays over one hardcoded scenario

## 6. Multipart patterns

### Number + essay
```php
$anstypes = array("number","essay");
$answer[0] = 42;
$displayformat[1] = "editornopaste";
$scoremethod[1] = "takeanything";

$questiontext = 'Part (a): '.$answerbox[0].'<br><br>'
  . 'Part (b): '.$answerbox[1];
```

### Matrix + file upload
```php
loadlibrary("matrix");

$x0,$y0 = nonzerodiffrands(-4,4,2);
$a = nonzerorand(-2,2);
$c = nonzerorand(-2,2);
$a22 = $a*$c + 1;
$b1 = $x0 + $a*$y0;
$b2 = $c*$x0 + $a22*$y0;

$Aug = matrix(array(1,$a,$b1,$c,$a22,$b2), 2, 3);
$RREF = matrix(array(1,0,$x0,0,1,$y0), 2, 3);

$anstypes = array("matrix","file");
$answer[0] = matrixformat($RREF);
$answersize[0] = "2,3";
$scoremethod[1] = "takeanything";
$answerformat[1] = "images,.pdf";
```

## 7. Library-specific helpers to preserve

### Statistics
```php
loadlibrary("stats");

$answer = round(normalcdf($mu,$sigma,$a,$b), 4);
$reg = linreg($xdata,$ydata);
$m = round($reg[0],3);
$b_int = round($reg[1],3);
$r2 = round($reg[3],4);
```

### Matrix
```php
loadlibrary("matrix");

$A = matrix(array(1,2,3,4), 2, 2);
$disp = matrixdisplaytable($A, "", 1, 1);
$answer = matrixformat($A);
$inv = matrixinverse($A);
$R = matrixreduce($A);
```

### Polynomials / formatting
```php
loadlibrary("polys");

$r1,$r2 = diffrands(-5,5,2);
$a = nonzerorand(1,3);
$p = formpolyfromroots($a, array($r1,$r2));
$disp = writepolyfrac($p);

$pretty = makepretty("3+-4");
$poly = polymakeprettydisp("1*x^2+0*x-3");
```

## 8. Worked mini-examples

### Linear equation
```php
$a = nonzerorand(-9,9) where ($a!=1 && $a!=-1);
$b = rand(-9,9);
$c = rand(-9,9);
$answer = ($c - $b) / $a;
```

### Normal distribution probability
```php
loadlibrary("stats");
loadlibrary("normalcurve");

$mu = rand(60,80);
$sigma = rand(5,15);
$a = round($mu - rrand(1,2,.5)*$sigma, 1);
$b = round($mu + rrand(1,2,.5)*$sigma, 1);
$answer = round(normalcdf($mu,$sigma,$a,$b), 4);
$graph = normalcurve($mu,$sigma,$mu-4*$sigma,$mu+4*$sigma,"x",$a,"right",$b,"left");
```

### Regression
```php
loadlibrary("stats");

$n = rand(6,8);
$xdata = rands(1,10,$n,'inc');
$true_m = rrand(0.5,2,0.5);
$true_b = rand(1,5);
for ($i=0..$n-1) {
  $ydata[$i] = round($true_m*$xdata[$i] + $true_b + rrand(-1,1,0.5), 1);
}
```

## 9. Common pitfalls

| Problem | Fix |
|---------|-----|
| `"$a^2"` with a negative value | Use `"($a)^2"` |
| Array value not interpolating | Use `{$ar[0]}` |
| `where` never resolves | Loosen the condition or add `else` |
| `3+-4` display text | Use `makepretty()` |
| `1*x+0` polynomial display | Use `polymakeprettydisp()` |
| Matrix answer grid missing | Add `$answersize[index] = "rows,cols"` |
| Essay editor allows paste | Use `$displayformat[0] = "editornopaste"` |
| Multiple library calls are cluttered | Combine them: `loadlibrary("stats,matrix")` |
