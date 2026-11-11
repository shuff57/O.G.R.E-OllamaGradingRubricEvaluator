//! Prompt text shared by every grading prompt. The wording was tuned by
//! experiment; change it only together with the grading server's copy.

/// The base grading philosophy stated near the top of every grading prompt.
pub const GRADING_PHILOSOPHY: &str = r#"Grade each response against the rubric criteria provided:
- Award credit proportional to how thoroughly each rubric criterion is met — a concise answer covering all criteria is equivalent to a longer one that does the same
- Evaluate what the student demonstrated, not what they omitted
- Award partial credit on any criterion where the student shows understanding of the concept, even if the wording is imprecise or informal — do not require textbook phrasing
- CONCEPTUAL THOROUGHNESS: When a student demonstrates genuine understanding of the underlying concept — correct reasoning, valid approach, or sound logic — award substantial credit even if execution is imperfect (arithmetic errors, missing units, informal notation). Concept mastery matters more than mechanical precision.
- WRONG-VALUE-CORRECT-METHOD RULE: A student who applies the correct method (substitution into a regression equation, residual = observed − predicted formula, sign interpretation, contextual reasoning) but uses wrong values (wrong equation, transcription typo, arithmetic error) has demonstrated the concept. Award AT LEAST 30% on each criterion where the method is visibly shown, even if every numeric value is wrong. The criterion's softening language ("even if approximate", "roughly correct", "possibly", "even if vague", "shows partial understanding") exists specifically to credit this case — honor that wording instead of treating "wrong number" as auto-fail.
- DOWNSTREAM ERROR PROPAGATION: Do not penalize a downstream criterion (e.g., residual calculation) for an upstream value error (e.g., wrong predicted ŷ) when the student used their own (incorrect) value consistently and applied the correct downstream method. Internal consistency with one's own prior step earns the same credit as full correctness for the downstream criterion.
- Use the full scoring range (0-10) as defined by the scoring anchors — do not compress toward the middle
- Treat scoring-scale descriptors as calibration references when assigning a score
- Off-topic, empty, or nonsensical responses receive a score of 0
- When no custom instructions are provided, grade solely on rubric alignment
- Instructor custom instructions (if any) take absolute precedence over this base philosophy
- When a student correctly identifies the expected value and states that observed counts are close or not close to expected, award partial credit for comparison even without listing each individual observed value"#;

/// What each point on the 0-10 scoring scale means, as `(score, descriptor)`.
pub const SCORING_SCALE_DESCRIPTORS: [(u8, &str); 11] = [
    (0, r#"No submission or completely blank"#),
    (
        1,
        r#"Off-topic: response does not address the question at all"#,
    ),
    (
        2,
        r#"Minimal effort: mentions the topic but shows almost no understanding"#,
    ),
    (
        3,
        r#"Very limited: some awareness of concepts but largely incomplete"#,
    ),
    (
        4,
        r#"Partial: shows basic familiarity but misses most key criteria"#,
    ),
    (
        5,
        r#"Developing: demonstrates partial understanding, covers some key points"#,
    ),
    (
        6,
        r#"Approaching: shows conceptual understanding of the core ideas with gaps in execution or detail — grasps the "why" but not all of the "how""#,
    ),
    (
        7,
        r#"Competent: demonstrates conceptual thoroughness — addresses all core rubric criteria with sound reasoning, minor execution gaps acceptable"#,
    ),
    (
        8,
        r#"Proficient: correctly and completely addresses all rubric criteria with minimal error"#,
    ),
    (9, r#"Strong: thorough and accurate with clear explanation"#),
    (
        10,
        r#"Excellent: comprehensive, precise, and clearly communicated"#,
    ),
];
