# VAPO-Style Structural Analysis — O.G.R.E. Grading Prompt

## Scope and FT Constraint
- Target: improve cross-model agreement from 92% to 95% (±1 tolerance) with minimal FT regression risk.
- Constraint: Qwen35-FT was trained on current prompt structure, so additions are preferred over reordering/removal.

### Finding 1: Persona is strong but not domain-explicit
**Dimension**: Role & Persona Clarity  
**Severity**: MEDIUM  
**Current state**: Prompt opens with: "You are an expert grading assistant." (generic role, not explicitly tied to HS statistics reasoning quality).  
**Suggestion**: Add one sentence after the opener: "You are grading high-school statistics explanations for conceptual accuracy, rubric alignment, and consistency across students with similar evidence quality."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: A more specific grader identity reduces model-to-model interpretation drift about strictness and expected conceptual depth, especially for borderline 6/7/8 decisions.

### Finding 2: Success criteria for the grader are implied, not explicit
**Dimension**: Role & Persona Clarity  
**Severity**: MEDIUM  
**Current state**: Success behavior is distributed across sections (philosophy, checklist, scale), but no compact "success definition" exists.  
**Suggestion**: Add a 2-line success contract near GRADING PROCESS: "Success means: (1) criterion_scores reflect rubric evidence only, (2) final score is consistent with SCORING SCALE and anchors for responses of similar quality."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Explicit success criteria improve calibration behavior for smaller/less-capable models without changing core prompt structure.

### Finding 3: 7 vs 8 boundary remains soft
**Dimension**: Instruction Specificity & Precision  
**Severity**: HIGH  
**Current state**: Scale says 7 = "addresses most rubric criteria adequately" and 8 = "correctly addresses all rubric criteria," but no operational threshold links this to criterion-level points.  
**Suggestion**: Add boundary rule under SCORING SCALE: "Score 8 requires both rubric criteria to be substantively correct (typically >=4/5 each) with no major conceptual error; score 7 when one criterion is only partially met or missing a key element."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: This directly targets the highest-risk disagreement zone (7 vs 8) and should improve GLM-5/Qwen alignment with Sonnet.

### Finding 4: 8 vs 9 distinction is underdefined
**Dimension**: Instruction Specificity & Precision  
**Severity**: MEDIUM  
**Current state**: 8 (proficient) vs 9 (strong) differ by wording depth, but not by concrete evidence expectations.  
**Suggestion**: Add one sentence: "Use 9 only when explanation is both accurate and clearly evidenced (explicit observed-vs-expected comparison + clear chi-square interpretation, including what larger/smaller values imply); otherwise use 8."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Tightens upper-band calibration without changing structure, reducing random 8↔9 variation.

### Finding 5: Partial credit percentage bands are not grounded to 5-point criteria
**Dimension**: Instruction Specificity & Precision  
**Severity**: HIGH  
**Current state**: PARTIAL CREDIT RULE uses 20-40%, 40-60%, 60-80%, but criteria are scored in 0-5 points and models may map bands inconsistently.  
**Suggestion**: Add a conversion hint immediately after PARTIAL CREDIT RULE: "For 5-point criteria, map bands roughly as 1-2 pts (20-40%), 2-3 pts (40-60%), 3-4 pts (60-80%); reserve 4-5 for essentially complete/correct coverage."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Constrains numeric interpretation across models and directly addresses cross-model variance around 5/6 and 6/7.

### Finding 6: "Short accurate answers" rule can over-credit generic brevity
**Dimension**: Instruction Specificity & Precision  
**Severity**: MEDIUM  
**Current state**: CRITICAL section says short accurate answers can score 8-9 regardless of length, but no explicit requirement for context-specific evidence is attached there.  
**Suggestion**: Add one clarifier to CRITICAL block: "Brevity is not penalized, but full-credit alignment still requires criterion-specific evidence (e.g., expected value statement + observed-vs-expected comparison for fairness; conceptual chi-square purpose and frequency relationship)."  
**Classification**: ADAPT  
**FT-Safety**: CAUTION  
**Rationale**: Helps prevent leniency drift on concise but vague answers. CAUTION because it modifies interpretation of an existing high-priority section.

### Finding 7: Batch vs single prompt delimiter can be made safer
**Dimension**: Section Ordering & Delimiter Clarity  
**Severity**: LOW  
**Current state**: Extracted artifact contains both "=== BATCH PROMPT ===" and "=== SINGLE STUDENT PROMPT ===" sections.  
**Suggestion**: Add a sentinel line before the second section in the assembled artifact: "END OF BATCH PROMPT — ignore remaining content for batch grading."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Improves delimiter clarity without reordering sections. Defensive against accidental mixed-context ingestion.

### Finding 8: Anchor wording partially conflicts with scale semantics
**Dimension**: Redundancy & Contradiction Detection  
**Severity**: HIGH  
**Current state**: Anchor says "Adequate (8/10): ... even with gaps or imprecision" while scale 8 says "correctly addresses all rubric criteria." This overlap can blur 7 vs 8.  
**Suggestion**: Modify anchor wording (keep same numeric anchor): "Adequate (8/10): Addresses all rubric criteria with generally correct understanding, though explanation may be less detailed/precise than top-tier responses."  
**Classification**: ADAPT  
**FT-Safety**: CAUTION  
**Rationale**: Removes semantic contradiction while preserving anchor positions. CAUTION due to in-place wording change in calibration text.

### Finding 9: Philosophy wording can be interpreted as "missing details should not matter"
**Dimension**: Redundancy & Contradiction Detection  
**Severity**: MEDIUM  
**Current state**: "Evaluate what the student demonstrated, not what they omitted" may be overgeneralized in tension with rubric completeness expectations.  
**Suggestion**: Add one clarifying clause in philosophy: "A rubric-required element not evidenced in the response is treated as not demonstrated for that criterion."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Preserves intent while eliminating a common misread that causes inflated scores from less strict models.

### Finding 10: Anchor levels would benefit from rubric-specific micro-examples
**Dimension**: Calibration Anchor Effectiveness  
**Severity**: MEDIUM  
**Current state**: Current anchors are generic descriptors; they do not show this rubric's concrete evidence pattern.  
**Suggestion**: Add one short "anchor cue" phrase per level (without changing structure), e.g., for 8: "clear fair/unfair judgment + expected-vs-observed comparison + correct chi-square purpose"; for 7: "attempts both criteria but one lacks key specificity."  
**Classification**: ADOPT  
**FT-Safety**: SAFE  
**Rationale**: Rubric-specific cues generally improve calibration consistency more than abstract labels.

### Finding 11: Batch JSON example contains inline comment that is invalid JSON
**Dimension**: JSON Format Reinforcement  
**Severity**: HIGH  
**Current state**: Batch response example includes: `// ... continue for all 2 students` inside the array example.  
**Suggestion**: Remove the inline comment from inside the JSON sample and place continuation guidance outside the JSON block as plain instruction text.  
**Classification**: ADAPT  
**FT-Safety**: CAUTION  
**Rationale**: Invalid JSON in exemplars can increase parse failures and model confusion. CAUTION because it edits existing example text.

### Finding 12: Single-student JSON example has a missing comma
**Dimension**: JSON Format Reinforcement  
**Severity**: HIGH  
**Current state**: Example object shows:
`"score": <integer 0-10 (see SCORING SCALE below)>`
`"feedback": "<...>"`
without a comma after `score`.  
**Suggestion**: Add the missing comma after the `score` field in the example output object.  
**Classification**: ADAPT  
**FT-Safety**: CAUTION  
**Rationale**: This is a high-leverage parse-stability fix. It does not change the output schema, only repairs exemplar syntax.

---

## Summary Recommendation Mix
- **ADOPT**: 8 findings (safe additive clarifications; preferred for FT stability)
- **ADAPT**: 4 findings (targeted wording/syntax fixes with moderate FT regression risk)
- **SKIP**: 0 findings selected as actionable in this pass

## Notes on FT regression risk
- Prioritize SAFE additions first, then benchmark.
- For ADAPT items, apply incrementally and run agreement regression checks (GLM-5/Sonnet, Qwen35-FT/Sonnet) after each small batch.
