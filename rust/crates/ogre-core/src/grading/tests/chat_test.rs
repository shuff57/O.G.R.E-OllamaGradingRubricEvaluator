//! Port of the tests in `grading-server/test/chat.test.js` that exercise
//! grading.js. Its "POST /api/chat — Input validation patterns" tests check
//! request handling written inline in the test file, not grading.js, and are
//! not ported.

use super::*;

// ── buildSingleGradePrompt ──────────────────────────────────────────────────

fn test_rubric() -> Rubric {
    rubric(
        r#"{
            "essayPrompt": "Explain the Pythagorean theorem and provide an example.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Understanding (5 points)", "points": 5, "items": ["Shows comprehension", "Uses examples"]}
            ],
            "rubricItems": [
                {"category": "Key Concepts", "items": ["a² + b² = c²", "Right triangle relationship"]}
            ],
            "modelText": "The Pythagorean theorem states that in a right triangle..."
        }"#,
    )
}

// "should include rubric essayPrompt"
#[test]
fn prompt_includes_essay_prompt() {
    let prompt = single_prompt(&test_rubric(), "Student answer", "Grade this");
    assert!(prompt.contains("Explain the Pythagorean theorem"));
}

// "should include student work"
#[test]
fn prompt_includes_student_work() {
    let prompt = single_prompt(
        &test_rubric(),
        "My answer about right triangles",
        "Grade this",
    );
    assert!(prompt.contains("My answer about right triangles"));
}

// "should include max score"
#[test]
fn prompt_includes_max_score() {
    assert!(single_prompt(&test_rubric(), "Answer", "Grade").contains("MAX SCORE: 10"));
}

// "should include additional instructions when provided"
#[test]
fn prompt_includes_additional_instructions() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Be lenient with spelling");
    assert!(prompt.contains("Be lenient with spelling"));
    assert!(prompt.contains("ADDITIONAL INSTRUCTIONS"));
}

// "should not include ADDITIONAL INSTRUCTIONS section when instructions is empty"
#[test]
fn prompt_omits_additional_instructions_when_empty() {
    assert!(!single_prompt(&test_rubric(), "Answer", "").contains("ADDITIONAL INSTRUCTIONS"));
}

// "should include checklist items"
// Fails upstream: the original expects a "GRADING CHECKLIST" heading, which
// the single prompt replaced with "GRADING REQUIREMENTS". The heading
// assertion is pinned to the current text.
#[test]
fn prompt_includes_checklist_items() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Grade");
    assert!(!prompt.contains("GRADING CHECKLIST"));
    assert!(prompt.contains("GRADING REQUIREMENTS"));
    assert!(prompt.contains("Understanding (5 points)"));
    assert!(prompt.contains("Shows comprehension"));
    assert!(prompt.contains("Uses examples"));
}

// "should include rubric items"
#[test]
fn prompt_includes_rubric_items() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Grade");
    assert!(prompt.contains("KEY CONCEPTS TO ADDRESS"));
    assert!(prompt.contains("Key Concepts"));
    assert!(prompt.contains("a² + b² = c²"));
}

// "should include model response when present"
#[test]
fn prompt_includes_model_response() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Grade");
    assert!(prompt.contains("MODEL RESPONSE"));
    assert!(prompt.contains("Pythagorean theorem states"));
}

// "should handle missing optional rubric fields gracefully"
#[test]
fn prompt_handles_missing_optional_fields() {
    let minimal = rubric(r#"{"essayPrompt": "Simple question", "maxScore": "5"}"#);
    let prompt = single_prompt(&minimal, "Answer", "");
    assert!(prompt.contains("Simple question"));
    assert!(prompt.contains("MAX SCORE: 10"));
    assert!(!prompt.contains("GRADING CHECKLIST"));
    assert!(!prompt.contains("KEY CONCEPTS TO ADDRESS"));
    assert!(!prompt.contains("MODEL RESPONSE"));
}

// "should request JSON response format with score and feedback"
#[test]
fn prompt_requests_json_with_score_and_feedback() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Grade");
    assert!(prompt.contains("JSON"));
    assert!(prompt.contains("\"score\""));
    assert!(prompt.contains("\"feedback\""));
}

// "should handle empty student work"
#[test]
fn prompt_handles_empty_student_work() {
    assert!(single_prompt(&test_rubric(), "", "Grade").contains("(No response submitted)"));
}

// "should include grading philosophy section"
#[test]
fn prompt_includes_grading_philosophy() {
    let prompt = single_prompt(&test_rubric(), "Answer", "Grade");
    assert!(prompt.contains("GRADING PHILOSOPHY"));
    assert!(prompt.contains("rubric criteria provided"));
}

// "should default maxScore to 10 when not specified"
#[test]
fn prompt_defaults_max_score_to_ten() {
    let no_max = rubric(r#"{"essayPrompt": "Question"}"#);
    assert!(single_prompt(&no_max, "Answer", "").contains("MAX SCORE: 10"));
}

// ── parseSingleGradeResponse ────────────────────────────────────────────────

// "should parse valid JSON response"
#[test]
fn parses_valid_json() {
    let grade = parse_single(r#"{"score":8,"feedback":"Good work!"}"#, 10.0);
    assert_eq!(grade.score, 8.0);
    assert_eq!(grade.feedback, "Good work!");
}

// "should parse JSON with half-point score"
#[test]
fn parses_half_point_score() {
    let grade = parse_single(r#"{"score":7.5,"feedback":"Solid effort"}"#, 10.0);
    assert_eq!(grade.score, 7.5);
    assert_eq!(grade.feedback, "Solid effort");
}

// "should handle JSON in markdown code fences"
#[test]
fn handles_json_code_fences() {
    let grade = parse_single(
        "```json\n{\"score\": 7.5, \"feedback\": \"Nice work\"}\n```",
        10.0,
    );
    assert_eq!(grade.score, 7.5);
    assert_eq!(grade.feedback, "Nice work");
}

// "should handle JSON in generic code fences"
#[test]
fn handles_generic_code_fences() {
    let grade = parse_single("```\n{\"score\": 6, \"feedback\": \"Adequate\"}\n```", 10.0);
    assert_eq!(grade.score, 6.0);
    assert_eq!(grade.feedback, "Adequate");
}

// "should clamp scores above maxScore"
#[test]
fn clamps_scores_above_max() {
    assert_eq!(
        parse_single(r#"{"score":15,"feedback":"Over max"}"#, 10.0).score,
        10.0
    );
}

// "should clamp negative scores to 0"
#[test]
fn clamps_negative_scores_to_zero() {
    assert_eq!(
        parse_single(r#"{"score":-3,"feedback":"Negative"}"#, 10.0).score,
        0.0
    );
}

// "should snap scores to nearest 0.5"
#[test]
fn snaps_to_nearest_half() {
    assert_eq!(
        parse_single(r#"{"score":7.3,"feedback":"Test"}"#, 10.0).score,
        7.5
    );
}

// "should snap 7.1 down to 7.0"
#[test]
fn snaps_down_to_whole() {
    assert_eq!(
        parse_single(r#"{"score":7.1,"feedback":"Test"}"#, 10.0).score,
        7.0
    );
}

// "should handle NaN score as 0"
#[test]
fn non_numeric_score_is_zero() {
    assert_eq!(
        parse_single(r#"{"score":"not a number","feedback":"Bad"}"#, 10.0).score,
        0.0
    );
}

// "should provide default feedback when empty"
#[test]
fn empty_feedback_gets_default() {
    assert_eq!(
        parse_single(r#"{"score":5,"feedback":""}"#, 10.0).feedback,
        "Graded by AI."
    );
}

// "should handle malformed JSON with error fallback"
#[test]
fn malformed_json_gives_error_fallback() {
    let grade = parse_single("This is not JSON at all", 10.0);
    assert_eq!(grade.score, 0.0);
    assert!(grade.feedback.contains("Error"));
}

// "should strip <think> reasoning blocks"
#[test]
fn strips_think_blocks() {
    let response = "<think>Let me analyze this carefully...</think>\n{\"score\": 9, \"feedback\": \"Excellent work\"}";
    let grade = parse_single(response, 10.0);
    assert_eq!(grade.score, 9.0);
    assert_eq!(grade.feedback, "Excellent work");
}

// "should extract JSON object from surrounding text"
#[test]
fn extracts_object_from_surrounding_text() {
    let grade = parse_single(
        "Here is the result:\n{\"score\": 6, \"feedback\": \"OK\"}\nDone.",
        10.0,
    );
    assert_eq!(grade.score, 6.0);
    assert_eq!(grade.feedback, "OK");
}

// "should use regex fallback for partial JSON"
#[test]
fn uses_pattern_fallback_for_partial_json() {
    let grade = parse_single(
        r#"Some text "score": 8, "feedback": "Good" more garbage"#,
        10.0,
    );
    assert_eq!(grade.score, 8.0);
    assert_eq!(grade.feedback, "Good");
}

// "should respect different maxScore values"
#[test]
fn respects_different_max_scores() {
    assert_eq!(
        parse_single(r#"{"score":8,"feedback":"OK"}"#, 5.0).score,
        4.0
    );
    assert_eq!(
        parse_single(r#"{"score":11,"feedback":"Over"}"#, 5.0).score,
        5.0
    );
}

// "should handle LaTeX backslashes in feedback"
#[test]
fn handles_latex_backslashes() {
    let response = r#"{"score": 8, "feedback": "Good use of \\( a^2 + b^2 = c^2 \\)"}"#;
    let grade = parse_single(response, 10.0);
    assert_eq!(grade.score, 8.0);
    assert!(grade.feedback.contains("a^2"));
}

// ── Grader mode — prompt construction for /api/chat ─────────────────────────

// "should build grader prompt with complete rubric"
#[test]
fn grader_prompt_with_complete_rubric() {
    let full = rubric(
        r#"{
            "essayPrompt": "Compare mitosis and meiosis.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Biology (5 pts)", "points": 5, "items": ["Identifies cell division stages", "Compares chromosome count"]}
            ],
            "rubricItems": [
                {"category": "Key Terms", "items": ["prophase", "metaphase", "anaphase", "telophase"]}
            ],
            "modelText": "Mitosis produces 2 identical cells, meiosis produces 4 gametes."
        }"#,
    );
    let prompt = single_prompt(&full, "Student writes about cells.", "Grade carefully");
    assert!(prompt.contains("Compare mitosis and meiosis"));
    assert!(prompt.contains("Student writes about cells"));
    assert!(prompt.contains("Grade carefully"));
    assert!(prompt.contains("MAX SCORE: 10"));
    assert!(prompt.contains("JSON"));
}

// "should handle multiple checklist categories"
#[test]
fn grader_prompt_with_multiple_categories() {
    let rubric = rubric(
        r#"{
            "essayPrompt": "Test",
            "maxScore": "20",
            "checklistItems": [
                {"category": "Content (10 pts)", "points": 10, "items": ["Accuracy", "Depth"]},
                {"category": "Style (10 pts)", "points": 10, "items": ["Clarity", "Organization"]}
            ]
        }"#,
    );
    let prompt = single_prompt(&rubric, "Answer", "");
    assert!(prompt.contains("Content (10 pts)"));
    assert!(prompt.contains("Style (10 pts)"));
    assert!(prompt.contains("Accuracy"));
    assert!(prompt.contains("Clarity"));
}

// "should handle rubric with no checklist but with rubricItems"
#[test]
fn grader_prompt_with_only_rubric_items() {
    let rubric = rubric(
        r#"{
            "essayPrompt": "Discuss gravity",
            "maxScore": "5",
            "rubricItems": [{"category": "Physics", "items": ["Newton's law", "Gravitational constant"]}]
        }"#,
    );
    let prompt = single_prompt(&rubric, "F = ma", "");
    assert!(prompt.contains("KEY CONCEPTS"));
    assert!(prompt.contains("Newton's law"));
    assert!(!prompt.contains("GRADING CHECKLIST"));
}

// "should handle rubric with only maxScore"
#[test]
fn grader_prompt_with_only_max_score() {
    let prompt = single_prompt(&rubric(r#"{"maxScore": "100"}"#), "Very long essay...", "");
    assert!(prompt.contains("MAX SCORE: 10"));
    assert!(prompt.contains("Very long essay"));
}

// "should preserve very long student work in prompt"
#[test]
fn grader_prompt_preserves_long_student_work() {
    let long_text = "A".repeat(5000);
    let prompt = single_prompt(
        &rubric(r#"{"essayPrompt": "Test", "maxScore": "10"}"#),
        &long_text,
        "",
    );
    assert!(prompt.contains(&long_text));
}

// "should handle special characters in student work"
#[test]
fn grader_prompt_handles_special_characters() {
    let prompt = single_prompt(
        &rubric(r#"{"essayPrompt": "Math test", "maxScore": "10"}"#),
        "Answer: ∫(x²)dx = x³/3 + C, where x ∈ ℝ",
        "",
    );
    assert!(prompt.contains("∫(x²)dx"));
    assert!(prompt.contains("x ∈ ℝ"));
}

// ── Grader mode — response parsing edge cases ───────────────────────────────

// "should handle score of exactly 0"
#[test]
fn score_of_exactly_zero() {
    let grade = parse_single(r#"{"score":0,"feedback":"No effort shown."}"#, 10.0);
    assert_eq!(grade.score, 0.0);
    assert_eq!(grade.feedback, "No effort shown.");
}

// "should handle score of exactly maxScore"
#[test]
fn score_of_exactly_max() {
    assert_eq!(
        parse_single(r#"{"score":10,"feedback":"Perfect!"}"#, 10.0).score,
        10.0
    );
}

// "should handle very large feedback text"
#[test]
fn very_large_feedback() {
    let feedback = format!("Detailed feedback: {}", "x".repeat(10000));
    let response = format!(r#"{{"score":7,"feedback":{}}}"#, json_string(&feedback));
    let grade = parse_single(&response, 10.0);
    assert!(grade.feedback.len() > 100);
    assert_eq!(grade.score, 7.0);
}

// "should handle unicode in feedback"
#[test]
fn unicode_in_feedback() {
    let grade = parse_single(
        r#"{"score":8,"feedback":"Great work! 大変よくできました 🎉"}"#,
        10.0,
    );
    assert!(grade.feedback.contains("大変よくできました"));
}

// "should handle response with extra fields (resilient parsing)"
#[test]
fn extra_fields_are_ignored() {
    let response = r#"{"score":7,"feedback":"Good","reasoning":"Student showed understanding","confidence":0.95}"#;
    let grade = parse_single(response, 10.0);
    assert_eq!(grade.score, 7.0);
    assert_eq!(grade.feedback, "Good");
}

// "should handle JSON with trailing comma (common AI output)"
#[test]
fn trailing_comma_still_yields_the_score() {
    assert_eq!(
        parse_single(r#"{"score": 6, "feedback": "OK",}"#, 10.0).score,
        6.0
    );
}

// "should handle multi-line feedback in JSON"
#[test]
fn multi_line_feedback() {
    let grade = parse_single(
        r#"{"score": 8, "feedback": "Line 1.\nLine 2.\nLine 3."}"#,
        10.0,
    );
    assert_eq!(grade.score, 8.0);
    assert!(grade.feedback.contains("Line 1"));
    assert!(grade.feedback.contains("Line 3"));
}

// "should snap 0.25 scores correctly (round to nearest 0.5)"
#[test]
fn quarter_scores_snap_to_halves() {
    let r1 = parse_single(r#"{"score":7.25,"feedback":"T"}"#, 10.0);
    let r2 = parse_single(r#"{"score":7.75,"feedback":"T"}"#, 10.0);
    assert_eq!(r1.score % 0.5, 0.0);
    assert_eq!(r2.score % 0.5, 0.0);
}

// "should handle maxScore of 5 (non-standard)"
#[test]
fn max_score_of_five() {
    let grade = parse_single(r#"{"score":7,"feedback":"Decent"}"#, 5.0);
    assert_eq!(grade.score, 3.5);
    assert!(grade.score <= 5.0);
}

// "should handle maxScore of 100"
#[test]
fn max_score_of_one_hundred() {
    let grade = parse_single(r#"{"score":8.5,"feedback":"B+"}"#, 100.0);
    assert_eq!(grade.score, 85.0);
    assert!(grade.score <= 100.0);
}

// "should handle response wrapped in triple backticks with language hint"
#[test]
fn fenced_response_with_language_hint() {
    let response =
        "```json\n{\n  \"score\": 9,\n  \"feedback\": \"Excellent understanding\"\n}\n```";
    let grade = parse_single(response, 10.0);
    assert_eq!(grade.score, 9.0);
    assert_eq!(grade.feedback, "Excellent understanding");
}

// "should handle multiple <think> blocks"
#[test]
fn multiple_think_blocks() {
    let response = "<think>First thought</think><think>Second thought</think>\n{\"score\": 7, \"feedback\": \"Good\"}";
    let grade = parse_single(response, 10.0);
    assert_eq!(grade.score, 7.0);
    assert!(!grade.feedback.contains("think"));
}

// ── buildSingleGradePrompt — prompt snapshot guards ─────────────────────────

fn sample_rubric() -> Rubric {
    rubric(
        r#"{
            "essayPrompt": "Describe the water cycle.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Science (5 pts)", "points": 5, "items": ["Evaporation", "Condensation"]}
            ]
        }"#,
    )
}

// "should include scoring scale section"
#[test]
fn snapshot_includes_scoring_scale() {
    let prompt = single_prompt(&sample_rubric(), "Water evaporates and rains", "");
    assert!(prompt.to_lowercase().contains("scoring scale"));
}

// "should not contain markdown code fences"
#[test]
fn snapshot_has_no_code_fences() {
    assert!(!single_prompt(&sample_rubric(), "Student answer here", "").contains("```"));
}

// "should instruct model to return JSON"
#[test]
fn snapshot_asks_for_json() {
    assert!(single_prompt(&sample_rubric(), "Student answer here", "").contains("JSON"));
}

// "should embed the student work text verbatim"
#[test]
fn snapshot_embeds_student_work_verbatim() {
    let student_text = "The water cycle involves evaporation, condensation, and precipitation.";
    assert!(single_prompt(&sample_rubric(), student_text, "").contains(student_text));
}
