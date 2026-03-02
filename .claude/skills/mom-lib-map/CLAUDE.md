# MOM Library Map — Topic Index

> **When to use**: Look up the correct MOM library tree `data-id` for any subject/topic. This is a passive reference skill — read by `mom-fact-finder`, never invoked directly. Read this index first, then read only the matching subject file.
>
> **Related skills**: `mom-fact-finder` (consumer of this skill), `mom-page-map` (DOM/URL reference)

---

## Subject Routing Table

| Subject | Root lib-ID | File | Representative Topics |
|---------|-------------|------|-----------------------|
| Arithmetic | lib3 | arithmetic.md | whole numbers, fractions, decimals, percents, ratios, proportions, integers, sequences, real numbers, measurement |
| Algebra | lib60 | algebra.md | linear equations, systems, quadratics, polynomials, factoring, exponential functions, logarithms, rational expressions, radicals, functions, slope, inequalities, conics |
| Trig | lib208 | trig.md | angles, unit circle, triangle trig, law of sines, law of cosines, graphing trig, identities, solving trig equations, polar, parametric, vectors |
| Calculus | lib224 | calculus.md | limits, derivatives, chain rule, optimization, related rates, integration, FTC, area between curves, volumes, series, sequences, Taylor series, multivariable |
| Differential Equations | lib349 | differential-equations.md | first order, second order, Laplace transform, systems, series solutions, Fourier series, PDEs, numerical methods |
| Linear Algebra | lib399 | linear-algebra.md | matrices, eigenvalues, eigenvectors, applications of linear algebra |
| Statistics | lib436 | statistics.md | hypothesis testing, confidence intervals, normal distribution, binomial, regression, correlation, ANOVA, chi-square, probability, sampling, descriptive statistics, expected value |
| Math for Liberal Arts | lib411 | liberal-arts.md | liberal arts math, general math topics |
| Discrete / Finite Math | lib1786 | discrete-math.md | consumer math, simple interest, compound interest, annuities, matrix operations, linear programming, simplex, business math, supply and demand, induction |
| Finance | lib823 | finance.md | time value of money, bonds, stocks, capital budgeting, capital structure, financial statements, financial ratios |
| Accounting | lib821 | accounting.md | journal entries, financial statements, adjusting entries, inventory, payroll, receivables, assets, liabilities, cost accounting, budgeting, variance analysis |
| Chemistry | lib1718 | chemistry.md | acids, bases, stoichiometry, gases, thermochemistry, kinetics, equilibrium, nuclear chemistry, organic chemistry, electronic structure |
| Physics | lib3434 | physics.md | kinematics, Newton's laws, energy, momentum, rotational motion, thermodynamics, waves, sound, electricity, circuits, magnetism, optics |
| Geometry | lib14428 | geometry.md | triangles, angles, circles, polygons, solids, area, perimeter, Pythagorean theorem, transformations, proofs, congruent, similar |
| Astronomy | lib6264 | astronomy.md | solar system, stars, galaxies, cosmology, black holes, astrobiology, SETI |
| Math for Elem Ed | lib10201 | elem-ed.md | elementary school math, whole number operations, fractions, decimals, number theory, sets, probability, geometry basics, numeration systems |

---

## Cross-Subject Topics

Some topics appear in multiple libraries — load the primary subject first; if results are sparse, also check the secondary:

- **Regression**: `statistics.md` (primary — lib476, lib38035) → `algebra.md` (lib6298) → `discrete-math.md` (lib1799)
- **Sequences**: `calculus.md` (primary — lib290+) → `arithmetic.md` (lib59) → `discrete-math.md` (lib1792–lib1793)
- **Complex numbers**: `algebra.md` (lib115) → `trig.md` (lib219, polar form)
- **Geometry / area / volume**: `geometry.md` (primary) → `arithmetic.md` (lib51) → `algebra.md` (lib68–lib71)
- **Probability / basic statistics**: `statistics.md` (primary — lib436+) → `arithmetic.md` (lib48)
- **Matrix operations**: `linear-algebra.md` (primary — lib399) → `discrete-math.md` (lib1794+)

---

## How to Add a New Subject

1. Create `.claude/skills/mom-lib-map/{subject}.md` with header + root node + table + `---` delimiter.
2. Add a row to the Subject Routing Table above.
3. Done — `mom-fact-finder` will automatically discover it via the index.
