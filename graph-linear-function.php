// === NAME - DESCRIPTION: Graph a Linear Function - Graph y=mx+b on a coordinate grid using the two-point line tool ===
// === SET QUESTION TYPE TO: draw ===

// === COMMON CONTROL ===

loadlibrary("stats");

/* ---------- 1. Random Parameters ---------- */
// Integer slopes only (no fractions) for clean grid snapping
$m_opts = array(-3, -2, -1, 1, 2, 3);
$m = randfrom($m_opts);

// Nonzero y-intercepts so the line is never through the origin
$b_opts = array(-4, -3, -2, -1, 1, 2, 3, 4);
$b = randfrom($b_opts);

/* ---------- 2. Build $answers string for grading ---------- */
// Draw type expects a function of x: "2x+3", "-x-4", "3x-2"
// makepretty() cleans up sign issues like "x+-3" -> "x-3"

if ($m == 1) {
    $m_part = "";
} elseif ($m == -1) {
    $m_part = "-";
} else {
    $m_part = $m;
}

$answers = makepretty($m_part . "x+" . $b);

/* ---------- 3. Build LaTeX display equation ---------- */
// Separate treatment from $answers so LaTeX renders cleanly

if ($m == 1) {
    $m_latex = "";
} elseif ($m == -1) {
    $m_latex = "-";
} else {
    $m_latex = $m;
}

if ($b > 0) {
    $b_latex = " + " . $b;
} else {
    $b_latex = " - " . abs($b);
}

$latex_eq = $m_latex . "x" . $b_latex;

/* ---------- 4. Draw settings ---------- */
$answerformat = "twopoint";
$grid = "-6,6,-6,6,1,1,300,300";
$snaptogrid = 1;

/* ---------- 5. Question text ---------- */
$questiontext = '
<div style="font-family:Arial; font-size:medium; line-height:1.6;">
  <p>Graph the linear function `y = ' . $latex_eq . '` on the coordinate grid below.</p>
  <p style="font-size:small; color:#555;">
    Use the two-point line tool: click two points on the grid that lie exactly on the line.
    The line will extend automatically once both points are placed.
  </p>
</div>';

//question text

$questiontext
$answerbox
