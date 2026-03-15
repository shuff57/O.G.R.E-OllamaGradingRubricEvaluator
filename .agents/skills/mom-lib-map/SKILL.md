---
name: mom-lib-map
description: Use when looking up the correct MyOpenMath library tree for a subject or topic and need to route to the right passive reference file under references/.
---

# MOM Library Map

> This is the single discoverable entry point for MyOpenMath library-tree lookup. Route by subject first, then read only the matching `references/{subject}.md` file. The reference files are plain markdown on purpose, so they stay out of the skill catalog.

## Prerequisites
- A subject or topic to map into the MyOpenMath library tree
- Read access to this skill's `references/` directory

## When to Use
- Need the correct MOM library root or topic node for a subject
- Need to route a topic like quadratics, stoichiometry, journal entries, or unit circle to the right library map
- Another MOM workflow needs a subject-specific topic map

## When NOT to Use
- DOM or URL lookup tasks; use `mom-page-map`
- Free-response question authoring; use `mom-frq`
- General skill discovery unrelated to MOM library trees

## Guardrails

> ⚠️ **Must NOT:**
> - Do not read all 16 subject files up front; route to the primary subject first.
> - Do not add YAML frontmatter to files under `references/`.
> - Do not treat `expand lib...` entries as direct selectable nodes.
> - Do not invent cross-subject mappings when the routing table or notes already cover the topic.

## Quick Start
1. Match the request to the closest subject in the routing table.
2. Open the listed `references/{subject}.md` file.
3. If the topic spans subjects, use the cross-subject notes before widening the search.

## Workflow

### Phase 1: Route to the Primary Subject
- **INPUT:** Topic, course, or subject hint
- **ACTION:** Use the routing table below to pick the best-fit subject reference file
- **OUTPUT:** One primary reference path such as `references/algebra.md`

### Phase 2: Read the Subject Reference
- **INPUT:** Primary subject reference file
- **ACTION:** Use the root node, expand path, and selectable node columns to identify the right library branch
- **OUTPUT:** Candidate MOM `lib...` node(s) for the requested topic

### Phase 3: Resolve Cross-Subject Ambiguity
- **INPUT:** Sparse or ambiguous results from the primary subject file
- **ACTION:** Check the cross-subject notes and only then open the secondary reference file
- **OUTPUT:** Final subject/file combination for the topic lookup

## Subject Routing Table

| Subject | Root lib-ID | File | Representative Topics |
|---------|-------------|------|-----------------------|
| Arithmetic | lib3 | `references/arithmetic.md` | whole numbers, fractions, decimals, percents, ratios, proportions, integers, sequences, real numbers, measurement |
| Algebra | lib60 | `references/algebra.md` | linear equations, systems, quadratics, polynomials, factoring, exponential functions, logarithms, rational expressions, radicals, functions, slope, inequalities, conics |
| Trig | lib208 | `references/trig.md` | angles, unit circle, triangle trig, law of sines, law of cosines, graphing trig, identities, solving trig equations, polar, parametric, vectors |
| Calculus | lib224 | `references/calculus.md` | limits, derivatives, chain rule, optimization, related rates, integration, FTC, area between curves, volumes, series, sequences, Taylor series, multivariable |
| Differential Equations | lib349 | `references/differential-equations.md` | first order, second order, Laplace transform, systems, series solutions, Fourier series, PDEs, numerical methods |
| Linear Algebra | lib399 | `references/linear-algebra.md` | matrices, eigenvalues, eigenvectors, applications of linear algebra |
| Statistics | lib436 | `references/statistics.md` | hypothesis testing, confidence intervals, normal distribution, binomial, regression, correlation, ANOVA, chi-square, probability, sampling, descriptive statistics, expected value |
| Math for Liberal Arts | lib411 | `references/liberal-arts.md` | liberal arts math, general math topics |
| Discrete / Finite Math | lib1786 | `references/discrete-math.md` | consumer math, simple interest, compound interest, annuities, matrix operations, linear programming, simplex, business math, supply and demand, induction |
| Finance | lib823 | `references/finance.md` | time value of money, bonds, stocks, capital budgeting, capital structure, financial statements, financial ratios |
| Accounting | lib821 | `references/accounting.md` | journal entries, financial statements, adjusting entries, inventory, payroll, receivables, assets, liabilities, cost accounting, budgeting, variance analysis |
| Chemistry | lib1718 | `references/chemistry.md` | acids, bases, stoichiometry, gases, thermochemistry, kinetics, equilibrium, nuclear chemistry, organic chemistry, electronic structure |
| Physics | lib3434 | `references/physics.md` | kinematics, Newton's laws, energy, momentum, rotational motion, thermodynamics, waves, sound, electricity, circuits, magnetism, optics |
| Geometry | lib14428 | `references/geometry.md` | triangles, angles, circles, polygons, solids, area, perimeter, Pythagorean theorem, transformations, proofs, congruent, similar |
| Astronomy | lib6264 | `references/astronomy.md` | solar system, stars, galaxies, cosmology, black holes, astrobiology, SETI |
| Math for Elem Ed | lib10201 | `references/elem-ed.md` | elementary school math, whole number operations, fractions, decimals, number theory, sets, probability, geometry basics, numeration systems |

## Cross-Subject Topics

- **Regression**: `references/statistics.md` (primary — lib476, lib38035) → `references/algebra.md` (lib6298) → `references/discrete-math.md` (lib1799)
- **Sequences**: `references/calculus.md` (primary — lib290+) → `references/arithmetic.md` (lib59) → `references/discrete-math.md` (lib1792–lib1793)
- **Complex numbers**: `references/algebra.md` (lib115) → `references/trig.md` (lib219, polar form)
- **Geometry / area / volume**: `references/geometry.md` (primary) → `references/arithmetic.md` (lib51) → `references/algebra.md` (lib68–lib71)
- **Probability / basic statistics**: `references/statistics.md` (primary — lib436+) → `references/arithmetic.md` (lib48)
- **Matrix operations**: `references/linear-algebra.md` (primary — lib399) → `references/discrete-math.md` (lib1794+)

## Error Handling

| Problem | Action |
|---------|--------|
| Topic fits multiple subjects | Start with the primary subject listed in Cross-Subject Topics, then read the secondary file only if needed. |
| No exact subject match | Choose the closest representative topic from the routing table, then inspect the root node and expand-path hints in that file. |
| Need a new subject map | Add a new `references/{subject}.md` file with plain markdown only, then add a routing-table row here. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Reading every reference file before routing | Use the Subject Routing Table first. |
| Adding YAML frontmatter to a reference file | Keep all `references/*.md` files as plain markdown only. |
| Treating an expand path as the final answer | Follow the path and then use the listed selectable node(s). |
| Ignoring cross-subject notes for overlapping topics | Check the Cross-Subject Topics section before guessing. |

## References
- `references/accounting.md`
- `references/algebra.md`
- `references/arithmetic.md`
- `references/astronomy.md`
- `references/calculus.md`
- `references/chemistry.md`
- `references/differential-equations.md`
- `references/discrete-math.md`
- `references/elem-ed.md`
- `references/finance.md`
- `references/geometry.md`
- `references/liberal-arts.md`
- `references/linear-algebra.md`
- `references/physics.md`
- `references/statistics.md`
- `references/trig.md`
