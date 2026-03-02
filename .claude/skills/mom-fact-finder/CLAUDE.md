# MOM Fact-Finder: Discover Patterns from the Question Bank

> **When to use**: You need to write a MOM question on a topic that `mom-frq` doesn't cover, or you want to see real examples of a question type in production before writing your own. This skill searches the live MOM question bank, reads actual question code, and synthesizes patterns.

> **Relationship to other skills**:
> - `mom-frq` — static reference (syntax, answer types, loadlibrary calls). Check it FIRST.
> - `mom-patterns` — living pattern library built by THIS skill. Check it SECOND (before launching browser).
> - `mom-fact-finder` (this skill) — last resort: browser-based discovery when neither above covers the topic.

---

## READ-ONLY SAFETY RULES (READ BEFORE ANYTHING ELSE)

> ⛔ **These rules are absolute. No exceptions.**

1. **ONLY navigate to these two URL patterns** (and no others):
   - `https://www.myopenmath.com/course/manageqset.php?cid={cid}` — search page
   - `https://www.myopenmath.com/course/moddataset.php?id={qid}&cid={cid}&viewonly=1` — view code
2. **NEVER navigate to edit mode** — the `viewonly=1` parameter MUST always be present on question pages.
3. **NEVER click**: Save, Quick Save, Preview, Delete, Edit, or any form submission button.
   - ⚠️ Save buttons ARE visible on viewonly pages and appear active — they are NOT safe to click.
   - Content protection is via `disabled`/`readOnly` attributes on textareas, not button removal.
4. **NEVER browse to another course's question bank** — only use the `cid` from the currently-active MOM tab.
5. **NEVER modify** `mom-frq/CLAUDE.md` or `mom-page-map/CLAUDE.md`.
6. **Rate limit**: minimum `waitForTimeout(1000)` between page navigations. Max 8 question pages per session.
7. **Confirm viewonly** before extracting: URL contains `viewonly=1` AND page heading contains "View:".

---

## Input Contract

Callers pass these parameters (in the task prompt or as structured context):

| Parameter | Required | Description |
|-----------|----------|-------------|
| `topic` | **YES** | Natural language description of the question topic (e.g., "linear regression", "hypothesis testing FRQ", "expected value") |
| `questionType` | no | MOM question type filter (e.g., `essay`, `multipart`, `number`, `choices`) — see full list in Advanced Search section |
| `library` | no | Library name to search within (e.g., `"All Libraries"`, `"OpenIntro Statistics"`) — defaults to All Libraries |
| `keywords` | no | Additional search keywords beyond topic (comma-separated) |
| `refresh` | no | If `true`, skip pattern library cache and always do fresh browser search |

**Example invocation** (from a parent task prompt):
```
Use mom-fact-finder to find patterns for: topic="confidence interval for proportions", questionType="essay", refresh=false
```

---

## Output Contract

Write results to `temp/mom_fact_finder_results.json` (create `temp/` dir if needed):

```json
{
  "topic": "confidence interval for proportions",
  "searchDate": "YYYY-MM-DD",
  "source": "browser|library",
  "examples": [
    {
      "qid": "12345",
      "type": "essay",
      "timesUsed": 4200,
      "commonControl": "...truncated to 80 lines...",
      "questionText": "...truncated to 40 lines..."
    }
  ],
  "patternSummary": {
    "keyPatterns": ["bullet 1", "bullet 2"],
    "functionCalls": ["loadlibrary('datasummary')", "..."],
    "suggestedApproach": "..."
  },
  "libraryUpdated": true
}
```

After writing the temp file, also **update `mom-patterns/CLAUDE.md`** (see Pattern Library Update section).

---

## Step 0 — Library-First Lookup

Before opening the browser:

1. Read `.claude/skills/mom-patterns/CLAUDE.md` (load it or read it directly).
2. Search for a section heading matching the topic (case-insensitive, partial match OK).
3. **If a match exists AND `refresh` is not `true`**:
   - Return the cached pattern from the library as your output.
   - Write `temp/mom_fact_finder_results.json` with `"source": "library"` and the cached pattern.
   - **Stop here — do NOT launch the browser.**
4. **If no match OR `refresh=true`**: proceed to Step 1 (Browser Search).

---

## Step 1 — Find or Open MOM Tab

```js
// Set state.searchTopic from the caller's 'topic' input parameter
// (The caller passes this via their task prompt — extract it and assign here before running)
// e.g., state.searchTopic = 'linear regression'; // set by caller
if (!state.searchTopic) throw new Error('state.searchTopic must be set before running this workflow. Assign: state.searchTopic = topic from input.');

// Find an existing MOM teacher tab
let momPage = context.pages().find(p => p.url().includes('myopenmath.com'));
if (!momPage) {
  // No MOM tab open — create one and navigate to manageqset
  momPage = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage());
  // CID is unknown — ask the caller to provide it, or stop with an error:
  throw new Error('No MyOpenMath tab found. Open MOM in Chrome with Playwriter enabled, then retry.');
}
state.momPage = momPage;

// Extract cid from current URL
const cidMatch = state.momPage.url().match(/[?&]cid=(\d+)/);
if (!cidMatch) throw new Error('Cannot extract cid from MOM URL: ' + state.momPage.url());
state.cid = cidMatch[1];
console.log('Using cid:', state.cid);
```

---

## Step 2 — Navigate to Question Set Management

```js
await state.momPage.goto(
  `https://www.myopenmath.com/course/manageqset.php?cid=${state.cid}`,
  { waitUntil: 'domcontentloaded' }
);
await state.momPage.waitForTimeout(1000);
console.log('URL:', state.momPage.url());
await snapshot({ page: state.momPage }).then(console.log);
```

---

## Step 3 — Set Search Scope (Topic-Specific Library)

> **Goal**: Scope the search to the MOM library that matches the caller's topic.
> Use topic-specific subject libraries (e.g. Statistics > Hypothesis Testing), NOT textbook-organized ones.

### Option A — Select a Topic Library via the Picker (PREFERRED)

```js
// 1. Open scope dropdown and click 'Select Libraries...'
await state.momPage.locator('#cursearchtype').click();
await state.momPage.waitForTimeout(300);
await state.momPage.locator('a[onclick*="libselect"]').click();
await state.momPage.waitForTimeout(1500);

// 2. The GB_window dialog is now open — an iframe loads libtree3.php
// Access it via frameLocator (required for clicks inside the iframe):
const gbFrame = state.momPage.frameLocator('#GB_frame');

// 3. Navigate the tree to the relevant subject category.
//    ALWAYS expand a parent node BEFORE trying to check a child:
//    Example path: Statistics (lib436) → Hypothesis Testing one pop (lib466) → children
await gbFrame.locator('[data-id="lib436"] > .tree-item-content > button.tree-expander').click();
await state.momPage.waitForTimeout(1000);

// 4. If the sub-node also needs expanding (no checkbox visible yet):
await gbFrame.locator('[data-id="lib466"] > .tree-item-content > button.tree-expander').click();
await state.momPage.waitForTimeout(1000);

// 5. Select the leaf library by clicking its tree-item-content:
//    Leaf nodes have a checkbox (<input type='checkbox'>) — categories do NOT.
//    Clicking the tree-item-content toggles aria-checked and adds to selectedLibs.
await gbFrame.locator('[data-id="lib{N}"] > .tree-item-content').click();

// 6. Click 'Use Libraries' — triggers setlib() → parent scope updates + auto-refresh:
await state.momPage.locator('#GB_footer button.primary').click();
await state.momPage.waitForTimeout(1500);
// Results table auto-refreshes. No need to click Search again.
// scope button now shows 'In Libraries ▼', #libnames shows the selected library name.
```

### Complete Topic → Library Map

> Use this table to find the correct `data-id` for any topic. "Direct" means the node has a checkbox and is immediately selectable. "Expand" means you must click the expander first, then select a child leaf.

---

#### 🔢 Arithmetic (lib3)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Real numbers | lib3 | lib58 (direct) |
| Sequences (arithmetic/geometric) | lib3 | lib59 (direct) |
| Whole numbers | lib3 → lib4 | expand lib4 |
| Integers | lib3 → lib11 | expand lib11 |
| Fractions | lib3 → lib16 | expand lib16 |
| Decimals | lib3 → lib29 | expand lib29 |
| Ratios / proportions | lib3 → lib33 | expand lib33 |
| Percents | lib3 → lib38 | expand lib38 |
| Measurement | lib3 → lib41 | expand lib41 |
| Coordinate plane | lib3 → lib45 | expand lib45 |
| Basic statistics (arith level) | lib3 → lib48 | expand lib48 |
| Basic geometry (arith level) | lib3 → lib51 | expand lib51 |

---

#### 🔣 Algebra (lib60)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Evaluate expressions / formulas | lib60 | lib67 (direct) |
| Linear inequalities (1 var) | lib60 | lib80 (direct) |
| Linear inequalities (2 var) | lib60 | lib138 (direct) |
| Direct / inverse variation | lib60 | lib202 (direct) |
| Interval notation | lib60 | lib207 (direct) |
| Regression (algebra) | lib60 | lib6298 (direct) |
| Algebra basics (combining terms, distribution) | lib60 → lib61 | lib62 Combining like terms, lib63 Distribution, lib64 Simplifying, lib65 Write expressions, lib66 Vocabulary |
| Geometry (area/volume/Pythagorean) | lib60 → lib68 | lib69 Area/Volume, lib70 Angles, lib71 Pythagorean |
| Linear equations (1 var) | lib60 → lib72 | lib73 Basic, lib74 Many steps, lib75 Fractions, lib76 Decimals, lib77 Abs value, lib78 Applications, lib79 Translation |
| Exponents | lib60 → lib81 | expand lib81 |
| Polynomials | lib60 → lib88 | lib89 Add/sub, lib90 Multiply, lib91-lib92 Division, lib93 Roots/intercepts, lib94 Graph behavior, lib95 Power functions, lib96 Evaluate, lib97 Applications, lib98 Definitions, lib99 Multi-var, lib100 Inequalities, lib16798 Remainder/Factor thms, lib16799 Rational Roots thm |
| Factoring | lib60 → lib101 | lib102 Common factor, lib103 By grouping, lib104 Trinomials (a=1), lib105 Trinomials (a≠1), lib106 Diff of squares, lib107 Sum/diff of cubes, lib108 Solving by factoring |
| Quadratics | lib60 → lib109 | lib110 Completing square, lib111 Square root principle, lib112 Quadratic formula, lib113 Vertex, lib114 Graphs, lib115 Complex numbers, lib116 Applications, lib117 Quad-form equations, lib6379 Quadratic systems, lib7045 Quadratic inequalities |
| Linear equations (2 var) / lines | lib60 → lib118 | lib119 Rates of change, lib120 Slope, lib121 Slope-intercept, lib122 Point-slope, lib123 Standard form, lib124 Graphs, lib125 Interpreting, lib126 Literal equations, lib127 Intercepts, lib128 Horizontal/vertical lines, lib129 Applications |
| Systems of linear equations | lib60 → lib131 | lib132 Graphing, lib133 Substitution, lib134 Elimination, lib135 Applications, lib136 3×3 systems, lib3731 Describe solutions, lib6304 Systems of inequalities |
| Rational expressions / equations | lib60 → lib139 | lib140 Simplify, lib141 Multiply/divide, lib142-lib143 Add/sub, lib144 Complex, lib145-lib146 Solve, lib147 Applications, lib149 Asymptotes, lib150 Graph behavior, lib154 Rational inequalities |
| Radicals / roots | lib60 → lib155 | lib156 Combining, lib157 Rational exponents, expand lib155 for more |
| Exponential functions | lib60 → lib163 | lib164 Graph, lib165 e, lib166 Solve (no logs), lib167 Write equations, lib168 Modeling/applications, lib169 Growth/decay rates |
| Logarithms | lib60 → lib170 | lib171 Properties, lib172 Simplify, lib173 Graphs, lib174 Solve exp w/logs, lib175+ Solve log equations |
| Algebra of functions (composition, inverse) | lib60 → lib178 | expand lib178 |
| Functions (domain, range, transformations) | lib60 → lib187 | expand lib187 |
| Conics | lib60 → lib195 | expand lib195 |
| Absolute value | lib60 → lib6538 | expand lib6538 |
| Graphs (general) | lib60 → lib203 | expand lib203 |

---

#### 📐 Trig (lib208) — all direct selectable

| Topic | Selectable node |
|-------|----------------|
| Angles | lib209 |
| Trig on circles (unit circle) | lib210 |
| Triangle trig (SOH-CAH-TOA) | lib211 |
| Law of sines / cosines | lib212 |
| Inverse trig functions | lib213 |
| Graphing trig functions | lib214 |
| Trig identities | lib215 |
| Solving trig equations | lib216 |
| Polar curves | lib217 |
| Parametric curves | lib218 |
| Complex numbers (polar form) | lib219 |
| Vectors | lib220 |
| Trig models | lib221 |
| Periodic functions | lib223 |
| Arc length / angular velocity | lib15909 |

---

#### ∫ Calculus (lib224)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Business calculus | lib224 | lib773 (direct) |
| Calculus I video lesson questions | lib224 | lib852 (direct) |
| Limits from graphs / estimation | lib224 → lib225 → lib226 | lib227 |
| Limits using limit laws | lib224 → lib225 → lib226 | lib228 |
| Rates of change | lib224 → lib225 → lib226 | lib229 |
| Continuity | lib224 → lib225 → lib226 | lib230 |
| Limits at infinity | lib224 → lib225 → lib226 | lib231 |
| Tangent slopes using limits | lib224 → lib225 → lib226 | lib232 |
| Derivative via limits | lib224 → lib225 → lib226 | lib233–lib235, lib28763 |
| Derivatives of polynomials | lib224 → lib225 → lib236 | lib237 |
| Derivatives of exponentials | lib224 → lib225 → lib236 | lib238 |
| Derivatives of trig functions | lib224 → lib225 → lib236 | lib239 |
| Derivatives of log functions | lib224 → lib225 → lib236 | lib240 |
| Product / quotient rule | lib224 → lib225 → lib236 | lib241–lib242 |
| Chain rule | lib224 → lib225 → lib236 | lib243 |
| Implicit differentiation | lib224 → lib225 → lib236 | lib244 |
| Logarithmic differentiation | lib224 → lib225 → lib236 | lib245 |
| Tangent lines | lib224 → lib225 → lib236 | lib32484 |
| Related rates | lib224 → lib225 → lib248 | lib249 |
| Optimization | lib224 → lib225 → lib248 | lib252 |
| L'Hôpital's rule | lib224 → lib225 → lib248 | lib253 |
| Max / min / shapes of curves | lib224 → lib225 → lib248 | lib250–lib251 |
| Mean value theorem | lib224 → lib225 → lib248 | lib258 |
| Antiderivatives (basic) | lib224 → lib225 → lib248 | lib255 |
| Definite integrals / FTC | lib224 → lib259 → lib260 | lib262–lib264 |
| Integration rules (sub, parts, trig sub, partial fractions) | lib224 → lib259 → lib260 | lib265–lib268 |
| Improper integrals | lib224 → lib259 → lib260 | lib271 |
| Area between curves | lib224 → lib259 → lib272 | lib273 |
| Volumes of revolution | lib224 → lib259 → lib272 | lib274 |
| Calculus diff eq (modeling, separable, logistic) | lib224 → lib282 | lib283–lib289 (all direct) |
| Sequences / series / convergence tests | lib224 → lib290 | lib291–lib302 (all direct) |
| Taylor / Maclaurin series | lib224 → lib290 | lib299–lib300 |
| Multivariable / 3D space | lib224 → lib303 | expand lib304, lib314, lib320, lib329, lib339 |
| Multivariable (general) | lib224 → lib303 | lib348 (direct) |

---

#### 🌀 Differential Equations (lib349)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Numerical methods | lib349 | lib398 (direct) |
| Intro / modeling | lib349 → lib350 | expand lib350 |
| First order | lib349 → lib355 | expand lib355 |
| Second order | lib349 → lib367 | expand lib367 |
| Higher order | lib349 → lib376 | expand lib376 |
| Series solutions | lib349 → lib380 | expand lib380 |
| Laplace transform | lib349 → lib382 | expand lib382 |
| First order systems | lib349 → lib386 | expand lib386 |
| Nonlinear systems | lib349 → lib394 | expand lib394 |
| Fourier series | lib349 → lib26138 | expand lib26138 |
| PDEs | lib349 → lib26545 | expand lib26545 |

---

#### 🗂️ Linear Algebra (lib399) — all direct selectable

| Topic | Selectable node |
|-------|----------------|
| Matrices | lib400 |
| Eigenvalues / eigenvectors | lib401 |
| Applications of linear algebra | lib402 |

---

#### 🎲 Statistics (lib436)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Correlation / regression | lib436 | lib476 (direct) |
| Multiple regression | lib436 | lib38035 (direct) |
| Stats general / mixed | lib436 | lib7223 Stats Lib (direct) |
| Real data problems | lib436 | lib27136 (direct) |
| Basic vocab / study design | lib436 → lib437 | lib438 Basic Vocab, lib439 Sampling methods, lib1988 Basic Computation |
| Frequency distributions | lib436 → lib440 | lib441 |
| Graphical representations | lib436 → lib440 | lib442 |
| Measures of center | lib436 → lib440 | lib443 |
| Measures of spread / variability | lib436 → lib440 | lib444 |
| Percentiles / quartiles | lib436 → lib440 | lib445 |
| Basic probability | lib436 → lib446 | lib447 |
| And / Or / Given (conditional probability) | lib436 → lib446 | lib448 |
| Counting (nCr, nPr) | lib436 → lib446 | lib449 |
| General probability distributions | lib436 → lib450 | lib451 |
| Binomial distribution | lib436 → lib450 | lib452 |
| Poisson distribution | lib436 → lib450 | lib453 |
| Geometric distribution | lib436 → lib450 | lib1783 |
| Expected value | lib436 → lib450 | lib29233 |
| General continuous distributions | lib436 → lib454 | lib455 |
| Standard normal distribution | lib436 → lib454 | lib456 |
| General normal distribution | lib436 → lib454 | lib457 |
| Central limit theorem | lib436 → lib454 | lib458 |
| Distribution of sample means | lib436 → lib454 | lib459 |
| Distribution of sample proportions | lib436 → lib454 | lib460 |
| Chebyshev / empirical rule | lib436 → lib454 | lib1784 |
| Confidence intervals — proportions | lib436 → lib461 | lib462 |
| Confidence intervals — means (σ known) | lib436 → lib461 | lib463 |
| Confidence intervals — means (σ unknown) | lib436 → lib461 | lib464 |
| Confidence intervals — variance | lib436 → lib461 | lib465 |
| Confidence intervals — 2-population | lib436 → lib461 → lib24735 | expand lib24735 |
| CI pieces / components | lib436 → lib461 | lib26325 |
| Hypothesis testing — proportion (1 pop) | lib436 → lib466 | lib467 |
| Hypothesis testing — mean (1 pop) | lib436 → lib466 | lib468 |
| Hypothesis testing — variance (1 pop) | lib436 → lib466 | lib469 |
| HT pieces (p-value, test stat, decision) | lib436 → lib466 | lib470 |
| Hypothesis testing — 2 proportions | lib436 → lib471 | lib472 |
| Hypothesis testing — 2 means independent | lib436 → lib471 | lib473 |
| Hypothesis testing — 2 means matched pairs | lib436 → lib471 | lib474 |
| Hypothesis testing — 2 variances | lib436 → lib471 | lib475 |
| Chi-square — multinomial | lib436 → lib477 | lib478 |
| Chi-square — contingency table | lib436 → lib477 | lib479 |
| One-way ANOVA | lib436 → lib480 | lib481 |
| Two-way ANOVA | lib436 → lib480 | lib482 |
| Stats with software (Excel/R/SPSS/Stata/JMP/Minitab) | lib436 → lib20384 | lib20386 Excel, lib20385 R, lib20387 SPSS, lib20389 Stata, lib20388 JMP, lib20434 Minitab |

---

#### 📚 Math for Liberal Arts (lib411)

| Topic | Note |
|-------|------|
| General / mixed | lib411 (expand to discover sub-topics) |

---

#### 🔷 Discrete / Finite Math (lib1786)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Mathematical induction | lib1786 | lib18425 (direct) |
| Simple interest | lib1786 → lib1787 | lib1788 |
| Compound interest | lib1786 → lib1787 | lib1789 |
| Annuities (FV) | lib1786 → lib1787 | lib1790 |
| Loans / PV annuities | lib1786 → lib1787 | lib1791 |
| Geometric sequences | lib1786 → lib1787 | lib1792 |
| Arithmetic sequences | lib1786 → lib1787 | lib1793 |
| Systems → matrices | lib1786 → lib1794 | lib1795 |
| Row reduction / Gaussian elimination | lib1786 → lib1794 | lib1796 |
| Matrix operations (add/sub/multiply/inverse) | lib1786 → lib1794 | lib1800, lib1807, lib1806 |
| Determinants | lib1786 → lib1794 | lib1802 |
| Leontief input-output | lib1786 → lib1794 | lib1805 |
| Regression and modeling | lib1786 → lib1794 | lib1799 |
| Linear programming — graphical | lib1786 → lib1812 | lib1814 |
| Linear programming — simplex | lib1786 → lib1812 | lib1816 |
| Cost, revenue, profit | lib1786 → lib1818 | lib1819 |
| Supply and demand | lib1786 → lib1818 | lib1821 |

---

#### 💰 Finance (lib823) — all direct selectable

| Topic | Selectable node |
|-------|----------------|
| Time value of money | lib824 |
| Bond valuation | lib825 |
| Stock valuation | lib826 |
| Capital budgeting | lib827 |
| Capital structure | lib828 |
| International finance | lib829 |
| Financial statements | lib830 |
| Financial ratios | lib831 |
| Finance general | lib832 |

---

#### 📊 Accounting (lib821) — all direct selectable

| Topic | Selectable node |
|-------|----------------|
| Intro / financial statements | lib839 |
| Journal entries / posting | lib840 |
| Adjusting / closing entries | lib841 |
| Merchandising operations | lib842 |
| Inventory / cost of sales | lib843 |
| Cash / internal controls | lib844 |
| Receivables | lib845 |
| Long-term assets | lib846 |
| Liabilities | lib847 |
| Payroll | lib848 |
| Corporate reporting | lib849 |
| Statement of cash flows | lib850 |
| Financial statement analysis | lib851 |
| Cost concepts / classifications | lib1768 |
| Job costing | lib1769 |
| Process costing | lib1770 |
| CVP analysis | lib1772 |
| Budgeting / variance analysis | lib1775–lib1777 |
| Capital budgeting (accounting) | lib1778 |

---

#### ⚗️ Chemistry (lib1718)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| Mass relationships / stoichiometry | lib1718 | lib1740 (direct) |
| Acids and bases | lib1718 → lib5363 | expand lib5363 |
| Atoms / molecules / ions | lib1718 → lib1739 | expand lib1739 |
| Composition / solutions | lib1718 → lib3348 | expand lib3348 |
| Electronic structure | lib1718 → lib3379 | expand lib3379 |
| Equilibrium | lib1718 → lib4793 | expand lib4793 |
| Essential ideas | lib1718 → lib3270 | expand lib3270 |
| Gases | lib1718 → lib1746 | expand lib1746 |
| Kinetics | lib1718 → lib4702 | expand lib4702 |
| Nuclear chemistry | lib1718 → lib5177 | expand lib5177 |
| Organic chemistry | lib1718 → lib4435 | expand lib4435 |
| Thermochemistry | lib1718 → lib1745 | expand lib1745 |

---

#### ⚡ Physics (lib3434)

| Topic | Expand path | Selectable node(s) |
|-------|-------------|-------------------|
| All physics topics | lib3434 → expand chapter node | each chapter = lib3435–lib3460+ range; expand relevant chapter for leaves |
| 1D Kinematics | lib3434 → lib3436 | expand lib3436 |
| 2D Kinematics | lib3434 → lib3437 | expand lib3437 |
| Newton's Laws | lib3434 → lib3438 | expand lib3438 |
| Energy / work | lib3434 → lib3440 | expand lib3440 |
| Momentum / collisions | lib3434 → lib3441 | expand lib3441 |
| Rotational motion | lib3434 → lib3443 | expand lib3443 |
| Thermodynamics | lib3434 → lib3448 | expand lib3448 |
| Waves / sound | lib3434 → lib3449–lib3450 | expand relevant node |
| Electricity / circuits | lib3434 → lib3451–lib3454 | expand relevant node |
| Magnetism | lib3434 → lib3455 | expand lib3455 |
| Optics | lib3434 → lib3458–lib3459 | expand relevant node |

---

#### 🔷 Geometry (lib14428) — mostly direct selectable

| Topic | Selectable node |
|-------|----------------|
| Lines | lib14429 |
| Angles | lib14430 |
| Triangles | lib14431 |
| Quadrilaterals | lib14432 |
| Polygons | lib14433 |
| Circles | lib14434 |
| Solids | lib14435 |
| Transformations | lib14436 |
| Reasoning / proofs | lib14437, lib36749 |
| Area and perimeter | lib14428 → lib14438 | expand lib14438 |
| Similar / congruent | lib14444 |
| Pythagorean theorem | lib14445 |

---

#### 🌌 Astronomy (lib6264) — mostly direct selectable

| Topic | Selectable node |
|-------|----------------|
| Solar system | lib7573 |
| Stars | lib7576 |
| Galaxies | lib7577 |
| Cosmology | lib7579 |
| Black holes | lib7580 |
| Astrobiology | lib7574 |
| SETI | lib7578 |
| Velocities | lib7572 |
| General / vocab | lib6265, lib7575 |

---

**How to navigate when topic isn't in this table**:
1. Expand the top-level subject category.
2. Read child labels — match to caller's topic.
3. Expand matching child; check if children have checkboxes.
4. Select all relevant leaf nodes → click 'Use Libraries'.
### Option B — All Libraries (fallback if no specific library found)

```js
// Use when the topic doesn't map to a known subject library
await state.momPage.locator('#cursearchtype').click();
await state.momPage.waitForTimeout(300);
await state.momPage.locator('a[onclick*="alllibs"]').click();
await state.momPage.waitForTimeout(800);
// Then proceed to Step 5 (search) — results will be from the whole community
```

### Tree Selection Helper — finding which nodes have checkboxes

```js
// After expanding a node, check which children are directly selectable:
const libFrame = state.momPage.frames().find(f => f.url().includes('libtree'));
const selectableChildren = await libFrame.evaluate((parentId) => {
  const parent = document.querySelector(`[data-id="${parentId}"]`);
  return [...(parent?.querySelectorAll(':scope > ul li.tree-item') || [])]
    .map(li => ({
      dataId: li.getAttribute('data-id'),
      label: li.querySelector('.tree-label')?.textContent?.trim(),
      selectable: !!li.querySelector(':scope > .tree-item-content input[type="checkbox"]'),
      hasChildren: !li.querySelector(':scope > .tree-item-content .tree-expander.no-children')
    }));
}, 'lib436'); // replace with actual parent data-id
console.log('Children:', JSON.stringify(selectableChildren));
```

---

## Step 4 — Apply Question Type Filter (if `questionType` provided)

```js
// Open advanced search panel
await state.momPage.locator('#advsearchbtn').click();
await state.momPage.waitForTimeout(500);

// Set type filter — map caller's questionType to the value from the table below
// e.g., 'essay' → 'essay', 'multiple choice' → 'choices'
const questionTypeValue = state.questionType || 'essay'; // use state.questionType set from input
await state.momPage.selectOption('select#search-type', questionTypeValue);
```

**Question type values** (use the `value` column in `select#search-type`):

| User says | `select#search-type` value |
|-----------|---------------------------|
| essay / free response / FRQ | `essay` |
| multiple choice | `choices` |
| multiple answer / checkbox | `multans` |
| number / numeric | `number` |
| multipart | `multipart` |
| matching | `matching` |
| matrix | `matrix` |
| interval | `interval` |
| N-tuple / point / vector | `ntuple` |
| calculated | `calculated` |
| string | `string` |
| file upload | `file` |
| drawing | `draw` |
| conditional | `conditional` |
| chemical equation | `chemeqn` |

---

## Step 5 — Search

```js
// Clear previous search and type new term
await state.momPage.locator('#search').fill('');
await state.momPage.locator('#search').type(state.searchTopic);
await state.momPage.locator('role=button[name="Search"]').first().click();
await state.momPage.waitForTimeout(2000); // wait for results
await snapshot({ page: state.momPage, search: /result|found|showing/i }).then(console.log);
```

If the results table is empty, broaden the search: remove `questionType` filter, try a shorter keyword, or switch to "All Libraries".

---

## Step 6 — Sort by Times Used (Descending)

⚠️ **Use keyboard Enter, NOT mouse click** — a `#GB_overlay` div may block mouse clicks temporarily.

```js
// Press Enter TWICE on the "Times Used" header to sort descending
await state.momPage.locator('table th:has-text("Times Used")').press('Enter');
await state.momPage.waitForTimeout(1500);
await state.momPage.locator('table th:has-text("Times Used")').press('Enter');
await state.momPage.waitForTimeout(1500);
```

---

## Step 7 — Extract Top Questions from Results Table

```js
const rows = await state.momPage.evaluate(() => {
  return [...document.querySelectorAll('table tbody tr')]
    .filter(r => r.querySelectorAll('td').length > 3)
    .map(r => {
      const cells = [...r.querySelectorAll('td')];
      return {
        desc: cells[1]?.textContent?.trim(),
        qid: cells[4]?.textContent?.trim(),  // matches output contract schema
        id: cells[4]?.textContent?.trim(),
        type: cells[5]?.textContent?.trim(),
        timesUsed: parseInt(cells[6]?.textContent?.trim() || '0', 10)
      };
    })
    .filter(r => r.qid && /^\d+$/.test(r.qid)) // only rows with numeric QIDs
    .sort((a, b) => b.timesUsed - a.timesUsed); // highest first
});

// Take top 5-8
const topQuestions = rows.slice(0, 7);
console.log('Top questions:', JSON.stringify(topQuestions, null, 2));
```

If `rows` is empty, try:
1. Removing the question type filter and re-searching.
2. Switching to "All Libraries" scope.
3. Trying a shorter or synonym search term.
4. Report no results found with a suggestion.

---

## Step 8 — Extract Code from Viewonly Pages

For each question in `topQuestions`:

```js
for (const q of topQuestions) {
  // SAFETY CHECK: only proceed if we have a valid numeric QID
  if (!q.qid || !/^\d+$/.test(q.qid)) continue;

  const viewonlyUrl = `https://www.myopenmath.com/course/moddataset.php?id=${q.qid}&cid=${state.cid}&viewonly=1`;
  await state.momPage.goto(viewonlyUrl, { waitUntil: 'domcontentloaded' });
  await state.momPage.waitForTimeout(1000);

  // CONFIRM viewonly mode before extracting
  const pageUrl = state.momPage.url();
  const pageHeading = await state.momPage.evaluate(() =>
    document.querySelector('h2, h1')?.textContent?.trim() || ''
  );
  if (!pageUrl.includes('viewonly=1') || !pageHeading.includes('View:')) {
    console.warn(`QID ${q.qid}: Not in viewonly mode \u2014 skipping. URL: ${pageUrl}`);
    continue;
  }

  // Extract code
  const control = await state.momPage.evaluate(() =>
    document.querySelector('textarea#control')?.value || ''
  );
  const qtext = await state.momPage.evaluate(() =>
    document.querySelector('textarea#qtext')?.value || ''
  );
  const qtype = await state.momPage.evaluate(() =>
    document.querySelector('input#qtype')?.value || ''
  );

  if (!control && !qtext) {
    console.warn(`QID ${q.qid}: Both control and qtext empty \u2014 skipping.`);
    continue;
  }

  // Truncate to limits
  const controlLines = control.split('\n');
  const qtextLines = qtext.split('\n');
  q.commonControl = controlLines.slice(0, 80).join('\n') + (controlLines.length > 80 ? '\n// [truncated]' : '');
  q.questionText = qtextLines.slice(0, 40).join('\n') + (qtextLines.length > 40 ? '\n<!-- [truncated] -->' : '');
  q.qtype = qtype;

  console.log(`QID ${q.qid}: extracted ${controlLines.length} control lines, ${qtextLines.length} qtext lines`);

  // Rate limit between navigations
  await state.momPage.waitForTimeout(1000);
}
```

---

## Step 9 — Session Expiry Detection

After each navigation, check for login redirect:

```js
const currentUrl = state.momPage.url();
if (currentUrl.includes('/login') || currentUrl.includes('index.php') || !currentUrl.includes('myopenmath.com/course/')) {
  throw new Error('MOM session expired or redirected to login. URL: ' + currentUrl + '\nAsk user to log back in and retry.');
}
```

---

## Step 10 — Synthesize Pattern

After extracting code from all questions, analyze the examples and produce a `patternSummary`:

1. **Identify common patterns** across the extracted code:
   - Which `loadlibrary()` calls appear? (e.g., `loadlibrary('datasummary')`)
   - What `$anstypes` are used?
   - Are there common variable naming conventions?
   - What rubric structures appear in essay questions?
   - What scoring methods (`$scoremethod`, `$scorevalue`) are used?
   - Any functions or techniques NOT documented in `mom-frq`?

2. **Write `keyPatterns`** — 3-5 bullet points describing what these questions do.

3. **Write `functionCalls`** — list every `loadlibrary()` and special function call found across all examples.

4. **Pick the best single example** (`bestExample`) — the one with the highest Times Used AND most illustrative code.

5. **Write `suggestedApproach`** — 2-3 sentence guidance for writing a similar question.

---

## Step 11 — Write Output File

```js
const fs = require('node:fs');
const path = require('node:path');

// Ensure temp/ exists
const tempDir = path.resolve('temp'); // relative to project root
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const result = {
  topic: state.searchTopic,
  searchDate: new Date().toISOString().slice(0, 10),
  source: 'browser',
  examples: topQuestions.filter(q => q.commonControl),
  patternSummary: {
    keyPatterns: ['...'], // fill from synthesis
    functionCalls: ['...'],
    suggestedApproach: '...'
  },
  libraryUpdated: false // will update to true after Step 12
};

fs.writeFileSync(
  path.join(tempDir, 'mom_fact_finder_results.json'),
  JSON.stringify(result, null, 2)
);
console.log('Results written to temp/mom_fact_finder_results.json');
```

---

## Step 12 — Update Pattern Library

Read `.claude/skills/mom-patterns/CLAUDE.md`, find or create the section for this topic, write the new entry, and save. 

### Entry Format (MUST follow exactly):

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
```php
[Best single code example, truncated to 80 lines for control, 40 lines for qtext]
```

### Extracted Function Calls
- `loadlibrary('name')` — description of what it provides
- [other functions found]

---
```

### Update Protocol

```
1. Read the full contents of `.claude/skills/mom-patterns/CLAUDE.md`
2. Count current lines.
3. If adding this section would exceed 800 lines:
   - Find the OLDEST section (earliest "Added" date) with fewer than 5 bullet references
   - Compress that section to a 3-line summary:
     ## [Topic] (summarized)
     **Added**: YYYY-MM-DD | **Types**: ... | Summarized: [key insight in 1 sentence]
     ---
4. Find the "## Patterns" heading or "<!-- PATTERNS -->" marker.
5. Check if a section for this topic already exists:
   - If YES and `refresh=true`: REPLACE the existing section entirely.
   - If YES and `refresh=false`: SKIP (library already has this topic).
   - If NO: APPEND the new section after the last existing pattern.
6. Update the "Topic Index" section to add/update this topic.
7. Update the "Last Updated" and "Total Entries" in the header.
8. Write the full updated file back.
9. Verify line count is ≤ 800.
```

**DO NOT** truncate or modify any section you are not updating. Preserve ALL existing entries exactly.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| No MOM tab open | Throw error asking user to open MOM in Chrome with Playwriter enabled |
| Can't extract `cid` from URL | Throw error with current URL for debugging |
| Search returns 0 results | Log warning, try: (1) remove type filter, (2) shorter keywords, (3) "All Libraries" scope. If still 0, return empty result with `"noResultsFound": true` |
| Viewonly page redirects to login | Throw session-expiry error with URL, ask user to log back in |
| `textarea#control` is empty for a question | Skip that question, log `QID {id}: empty control — skipped` |
| All questions have empty control | Return early with extracted question text only, note in output |
| Pattern library update would exceed 800 lines | Compress oldest entry first, then write new entry |
| `mom-patterns/CLAUDE.md` file not found | Proceed without library update, note in output; do not create it here |
