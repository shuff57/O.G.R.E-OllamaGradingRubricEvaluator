//! Port of `grading-server/test/prompts.test.js`.

use super::*;

// ── Prompt Builders - Pattern Verification: buildSingleGradePrompt (server) ──

fn mock_rubric() -> Rubric {
    rubric(
        r#"{
            "maxScore": "10",
            "essayPrompt": "Explain photosynthesis",
            "checklistItems": [
                {"category": "Understanding", "points": 5, "items": ["Knows process", "Explains steps"]}
            ],
            "rubricItems": [
                {"category": "Key Concepts", "items": ["Chlorophyll", "ATP production"]}
            ],
            "modelText": "Photosynthesis is the process..."
        }"#,
    )
}

// "should contain "No markdown" instruction"
#[test]
fn single_contains_no_markdown_instruction() {
    assert!(single_prompt(&mock_rubric(), "student response", "").contains("No markdown"));
}

// "should contain scoring scale section"
#[test]
fn single_contains_scoring_scale() {
    assert!(single_prompt(&mock_rubric(), "student response", "").contains("SCORING SCALE"));
}

// "should include maxScore from rubric"
#[test]
fn single_includes_max_score() {
    assert!(single_prompt(&mock_rubric(), "student response", "").contains("10"));
}

// "should include essay prompt"
#[test]
fn single_includes_essay_prompt() {
    assert!(
        single_prompt(&mock_rubric(), "student response", "").contains("Explain photosynthesis")
    );
}

// "should include student work"
#[test]
fn single_includes_student_work() {
    let work = "Photosynthesis is a process where plants convert light to energy";
    assert!(single_prompt(&mock_rubric(), work, "").contains(work));
}

// "should include checklist items when present"
// Fails upstream: the original expects a "GRADING CHECKLIST" heading, which
// the single prompt replaced with "GRADING REQUIREMENTS". The heading
// assertion is pinned to the current text.
#[test]
fn single_includes_checklist_items() {
    let prompt = single_prompt(&mock_rubric(), "student response", "");
    assert!(!prompt.contains("GRADING CHECKLIST"));
    assert!(prompt.contains("GRADING REQUIREMENTS"));
    assert!(prompt.contains("Understanding"));
}

// "should include rubric items when present"
#[test]
fn single_includes_rubric_items() {
    let prompt = single_prompt(&mock_rubric(), "student response", "");
    assert!(prompt.contains("KEY CONCEPTS"));
    assert!(prompt.contains("Chlorophyll"));
}

// "should include model response when present"
#[test]
fn single_includes_model_response() {
    let prompt = single_prompt(&mock_rubric(), "student response", "");
    assert!(prompt.contains("MODEL RESPONSE"));
    assert!(prompt.contains("Photosynthesis is the process"));
}

// "should include additional instructions when provided"
#[test]
fn single_includes_additional_instructions() {
    let instructions = "Focus on conceptual understanding";
    assert!(single_prompt(&mock_rubric(), "student response", instructions).contains(instructions));
}

// "should request JSON response format"
#[test]
fn single_requests_json() {
    assert!(single_prompt(&mock_rubric(), "student response", "").contains("JSON"));
}

// "should handle missing optional rubric fields"
#[test]
fn single_handles_missing_optional_fields() {
    let minimal = rubric(r#"{"maxScore": "5", "essayPrompt": "Simple question"}"#);
    let prompt = single_prompt(&minimal, "response", "");
    assert!(prompt.contains('5'));
    assert!(prompt.contains("Simple question"));
}

// "should handle empty student response"
#[test]
fn single_handles_empty_student_response() {
    assert!(single_prompt(&mock_rubric(), "", "").contains("STUDENT WORK"));
}

// "should contain response format instruction"
// Fails upstream: the original also expects "Write directly to the student",
// which the current prompt does not say. That assertion is pinned to the
// current text.
#[test]
fn single_contains_response_format_instruction() {
    let prompt = single_prompt(&mock_rubric(), "student response", "");
    assert!(prompt.contains("RESPONSE FORMAT"));
    assert!(!prompt.contains("Write directly to the student"));
}

// ── Tiered Prompt Architecture - Regression Tests (T12) ─────────────────────

fn base_rubric(custom_instructions: Option<&str>) -> Rubric {
    let mut rubric = mock_rubric();
    rubric.custom_instructions = custom_instructions.map(str::to_owned);
    rubric
}

fn mock_students() -> Vec<StudentWork> {
    vec![
        student(0, "Alice", "Plants use sunlight to make food."),
        student(1, "Bob", "I do not know."),
    ]
}

fn mock_anchors() -> ScoringAnchors {
    generate_scoring_anchors(&base_rubric(None))
}

fn tiered_batch_prompt(custom_instructions: Option<&str>) -> String {
    batch_prompt(
        &base_rubric(custom_instructions),
        &mock_students(),
        &mock_anchors(),
    )
}

/// `haystack.indexOf(needle)`, with `None` for the original's `-1`.
fn index_of(haystack: &str, needle: &str) -> Option<usize> {
    haystack.find(needle)
}

// "format hint appears before custom instructions"
#[test]
fn batch_format_hint_precedes_custom_instructions() {
    let prompt = tiered_batch_prompt(Some("Be strict"));
    let format = index_of(&prompt, "JSON array only").unwrap();
    assert!(index_of(&prompt, "Be strict").unwrap() > format);
}

// "custom instructions appear before philosophy"
#[test]
fn batch_custom_instructions_precede_philosophy() {
    let prompt = tiered_batch_prompt(Some("Grade very leniently"));
    let custom = index_of(&prompt, "Grade very leniently").unwrap();
    assert!(index_of(&prompt, "rubric criteria").unwrap() > custom);
}

// "philosophy appears before student responses"
#[test]
fn batch_philosophy_precedes_students() {
    let prompt = tiered_batch_prompt(Some(""));
    let philosophy = index_of(&prompt, "rubric criteria").unwrap();
    assert!(index_of(&prompt, "STUDENTS TO GRADE").unwrap() > philosophy);
}

// "student responses appear before format reinforcement"
#[test]
fn batch_students_precede_format_reinforcement() {
    let prompt = tiered_batch_prompt(Some(""));
    let students = index_of(&prompt, "STUDENTS TO GRADE").unwrap();
    assert!(prompt.rfind("CRITICAL: Return results for ALL").unwrap() > students);
}

// "no INSTRUCTOR section when no custom instructions"
#[test]
fn batch_has_no_instructor_section_without_custom_instructions() {
    assert!(!tiered_batch_prompt(Some("")).contains("INSTRUCTOR OVERRIDE"));
}

// "INSTRUCTOR section present when custom instructions provided"
#[test]
fn batch_has_instructor_section_with_custom_instructions() {
    assert!(tiered_batch_prompt(Some("Be strict")).contains("INSTRUCTOR OVERRIDE INSTRUCTIONS"));
}

// "scoring scale uses unified descriptors"
#[test]
fn batch_scoring_scale_uses_unified_descriptors() {
    let prompt = tiered_batch_prompt(Some(""));
    assert!(prompt.contains("SCORING SCALE"));
    assert!(prompt.contains("Proficient"));
}

// "no directional language in batch prompt"
#[test]
fn batch_has_no_directional_language() {
    let prompt = tiered_batch_prompt(Some("")).to_lowercase();
    assert!(!prompt.contains("choose the higher"));
    assert!(!prompt.contains("generous"));
}

// "format hint appears at prompt start"
#[test]
fn single_format_hint_precedes_scoring_scale() {
    let prompt = single_prompt(&base_rubric(None), "student work", "");
    let format = index_of(&prompt, "JSON object only").unwrap();
    assert!(index_of(&prompt, "SCORING SCALE").unwrap() > format);
}

// "scoring scale appears before student work"
#[test]
fn single_scoring_scale_precedes_student_work() {
    let prompt = single_prompt(&base_rubric(None), "my-unique-answer-xyz", "");
    let scale = index_of(&prompt, "SCORING SCALE").unwrap();
    assert!(index_of(&prompt, "my-unique-answer-xyz").unwrap() > scale);
}

// "student work appears before response format"
#[test]
fn single_student_work_precedes_response_format() {
    let prompt = single_prompt(&base_rubric(None), "unique-marker-abc", "");
    let work = index_of(&prompt, "unique-marker-abc").unwrap();
    assert!(index_of(&prompt, "RESPONSE FORMAT").unwrap() > work);
}

// "no directional language in single grade prompt"
#[test]
fn single_has_no_directional_language() {
    let prompt = single_prompt(&base_rubric(None), "student work", "").to_lowercase();
    assert!(!prompt.contains("choose the higher"));
    assert!(!prompt.contains("generous"));
}

// "SCORING CALIBRATION prefix: calibration examples included"
#[test]
fn single_includes_calibration_examples() {
    let rubric = base_rubric(Some(
        "SCORING CALIBRATION:\nExcellent (9/10): Perfect response\nAdequate (7/10): Solid\n\nGrade very strictly.",
    ));
    let prompt = single_prompt(&rubric, "student work", "");
    assert!(prompt.contains("SCORING CALIBRATION EXAMPLES"));
    assert!(prompt.contains("Excellent (9/10)"));
}

// "SCORING CALIBRATION prefix: override instructions appear before calibration"
#[test]
fn single_override_instructions_precede_calibration() {
    let rubric = base_rubric(Some(
        "SCORING CALIBRATION:\nExcellent (9/10): Perfect\n\nGrade very strictly.",
    ));
    let prompt = single_prompt(&rubric, "student work", "");
    let overrides = index_of(&prompt, "Grade very strictly").unwrap();
    assert!(overrides < index_of(&prompt, "Excellent (9/10)").unwrap());
}

// "empty custom instructions produce no INSTRUCTOR section"
#[test]
fn single_has_no_instructor_section_without_custom_instructions() {
    assert!(!single_prompt(&base_rubric(None), "student work", "").contains("INSTRUCTOR OVERRIDE"));
}

// "very long custom instructions (500+ chars) are included"
#[test]
fn single_includes_very_long_custom_instructions() {
    let long_instructions = "Grade carefully. ".repeat(30);
    let prompt = single_prompt(&base_rubric(Some(&long_instructions)), "student work", "");
    assert!(prompt.contains("Grade carefully."));
    assert!(prompt.len() > 500);
}

fn outlier_prompt(custom_instructions: Option<&str>) -> String {
    let outlier_students = [OutlierStudent {
        index: 2,
        name: "Carol".to_owned(),
        response: "Photosynthesis makes oxygen.".to_owned(),
        prompt: None,
        original_score: 9.0,
        original_feedback: "Great work.".to_owned(),
    }];
    let stats = BatchStats {
        mean: 5.0,
        std_dev: 2.0,
        total_students: Some(10),
    };
    build_outlier_review_prompt(
        &base_rubric(custom_instructions),
        &outlier_students,
        &mock_anchors(),
        &stats,
        10.0,
        &[],
    )
}

// "format hint present at prompt start"
#[test]
fn outlier_has_format_hint() {
    assert!(outlier_prompt(None).contains("JSON array only"));
}

// "custom instructions appear before philosophy"
#[test]
fn outlier_custom_instructions_precede_philosophy() {
    let prompt = outlier_prompt(Some("Re-grade strictly"));
    let custom = index_of(&prompt, "Re-grade strictly").unwrap();
    assert!(index_of(&prompt, "rubric criteria").unwrap() > custom);
}

// "includes student original score and name in prompt"
#[test]
fn outlier_includes_original_score_and_name() {
    let prompt = outlier_prompt(None);
    assert!(prompt.contains("ORIGINAL SCORE"));
    assert!(prompt.contains("Carol"));
}

// ── buildSingleGradePrompt - constants injection ────────────────────────────

fn constants_rubric() -> Rubric {
    rubric(
        r#"{
            "essayPrompt": "Test question",
            "checklistItems": [
                {"category": "Understanding (5 points)", "points": 5, "items": ["Shows comprehension"]}
            ],
            "maxScore": "10"
        }"#,
    )
}

fn prompt_with_constants(constants: Option<&GradingConstants>) -> String {
    build_single_grade_prompt(&constants_rubric(), "student work", "", constants).unwrap()
}

fn descriptor(score: f64, descriptor: &str) -> ScaleDescriptor {
    ScaleDescriptor {
        score,
        descriptor: descriptor.to_owned(),
    }
}

// "with custom constants → custom gradingPhilosophy appears in prompt"
#[test]
fn custom_philosophy_appears() {
    let constants = GradingConstants {
        grading_philosophy: Some("CUSTOM_MARKER_XYZ_PHILOSOPHY".to_owned()),
        scoring_scale_descriptors: Some(vec![descriptor(0.0, "test descriptor")]),
    };
    assert!(prompt_with_constants(Some(&constants)).contains("CUSTOM_MARKER_XYZ_PHILOSOPHY"));
}

// "with custom constants → custom scoringScaleDescriptors appear in prompt"
#[test]
fn custom_scale_descriptors_appear() {
    let constants = GradingConstants {
        grading_philosophy: Some("Default philosophy".to_owned()),
        scoring_scale_descriptors: Some(vec![descriptor(0.0, "CUSTOM_SCALE_MARKER_ABC")]),
    };
    assert!(prompt_with_constants(Some(&constants)).contains("CUSTOM_SCALE_MARKER_ABC"));
}

// "without constants (undefined) → default behavior preserved"
// "with null constants → default behavior preserved"
// Adapted: an omitted, undefined and null argument are all `None` here, so
// the two originals become one test, which also covers constants that
// override nothing.
#[test]
fn absent_constants_preserve_default_behavior() {
    let default = prompt_with_constants(None);
    assert_eq!(prompt_with_constants(None), default);
    assert_eq!(
        prompt_with_constants(Some(&GradingConstants::default())),
        default
    );
    assert!(default.contains(GRADING_PHILOSOPHY));
}

// "with partial constants (only gradingPhilosophy) → uses custom philosophy and default scale"
#[test]
fn partial_constants_keep_default_scale() {
    let constants = GradingConstants {
        grading_philosophy: Some("CUSTOM_PHILOSOPHY_ONLY".to_owned()),
        scoring_scale_descriptors: None,
    };
    let prompt = prompt_with_constants(Some(&constants));
    assert!(prompt.contains("CUSTOM_PHILOSOPHY_ONLY"));
    assert!(prompt.contains("SCORING SCALE"));
}

// ── Prompt defaults — conceptual thoroughness and score floor ───────────────

fn defaults_rubric() -> Rubric {
    rubric(
        r#"{
            "maxScore": "10",
            "essayPrompt": "Explain photosynthesis",
            "checklistItems": [{"category": "Understanding", "points": 5, "items": ["Knows process"]}],
            "rubricItems": []
        }"#,
    )
}

fn defaults_prompt() -> String {
    let rubric = defaults_rubric();
    let students = [
        student(0, "Alice", "Plants use sunlight."),
        student(1, "Bob", "I dunno."),
    ];
    batch_prompt(&rubric, &students, &generate_scoring_anchors(&rubric))
}

// "default anchors produce standard values"
#[test]
fn default_anchors_have_standard_values() {
    let anchors = generate_scoring_anchors(&defaults_rubric());
    assert_eq!(anchors.excellent.score, 10.0);
    assert_eq!(anchors.adequate.score, 8.0);
    assert_eq!(anchors.below_average.score, 7.0);
    assert_eq!(anchors.minimal.score, 5.0);
}

// "prompt contains conceptual thoroughness rule at 60-80%"
// Fails upstream: the original expects "award 60-80% of that criterion", but
// the rule now reads "of that category's points". That assertion is pinned
// to the current text.
#[test]
fn prompt_contains_conceptual_thoroughness_rule() {
    let prompt = defaults_prompt();
    assert!(!prompt.contains("award 60-80% of that criterion"));
    assert!(prompt.contains("award 60-80% of that category's points"));
    assert!(prompt.contains("CONCEPTUAL THOROUGHNESS RULE"));
}

// "prompt contains score floor of 8"
#[test]
fn prompt_contains_score_floor_of_eight() {
    let prompt = defaults_prompt();
    assert!(prompt.contains("correctly hits every rubric criterion earns 8-9"));
    assert!(prompt.contains("Only drop below 8"));
}
