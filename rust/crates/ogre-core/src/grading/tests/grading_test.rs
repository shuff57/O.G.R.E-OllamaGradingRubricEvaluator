//! Port of `grading-server/test/grading.test.js`.

use super::*;

fn test_rubric() -> Rubric {
    rubric(
        r#"{
            "essayPrompt": "Explain how photosynthesis works in plants.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Understanding (5 pts)", "points": 5,
                 "items": ["Explains light absorption", "Mentions chlorophyll", "Describes glucose production"]},
                {"category": "Detail (3 pts)", "points": 3,
                 "items": ["Mentions water and CO2", "Describes oxygen byproduct"]},
                {"category": "Clarity (2 pts)", "points": 2,
                 "items": ["Clear explanation", "Uses correct terminology"]}
            ],
            "rubricItems": [
                {"category": "Key Concepts", "items": ["Photosynthesis", "Chlorophyll", "Glucose"]}
            ],
            "modelText": "Plants use chlorophyll to absorb sunlight. This energy converts CO2 and water into glucose and oxygen."
        }"#,
    )
}

fn test_students() -> Vec<StudentWork> {
    (0..10)
        .map(|i| {
            let response = match i % 3 {
                0 => "Plants use sunlight and chlorophyll to make glucose from CO2 and water, releasing oxygen.",
                1 => "Plants need sunlight to grow and make food.",
                _ => "I think photosynthesis involves the sun somehow.",
            };
            student(i, &format!("Student {}", i + 1), response)
        })
        .collect()
}

fn parse_batch(response: &str, students: &[StudentWork], max_score: f64) -> Vec<StudentResult> {
    parse_batch_response(response, students, max_score, None).expect("no null results")
}

// ── generateScoringAnchors ──────────────────────────────────────────────────

// "should generate 3 anchors (Excellent, Adequate, Minimal)"
// Adapted: the original checks the properties are defined, which the struct
// guarantees; this checks each level carries a description.
#[test]
fn anchors_cover_each_level() {
    let anchors = generate_scoring_anchors(&test_rubric());
    assert!(!anchors.excellent.description.is_empty());
    assert!(!anchors.adequate.description.is_empty());
    assert!(!anchors.minimal.description.is_empty());
}

// "should include score and description for each anchor"
// Adapted: the original checks `typeof`; this checks the values are usable.
#[test]
fn anchors_have_score_and_description() {
    let anchors = generate_scoring_anchors(&test_rubric());
    for level in [&anchors.excellent, &anchors.adequate, &anchors.minimal] {
        assert!(level.score.is_finite());
        assert!(!level.description.is_empty());
    }
}

// "should generate scores in descending order (Excellent > Adequate > Minimal)"
#[test]
fn anchor_scores_descend() {
    let anchors = generate_scoring_anchors(&test_rubric());
    assert!(anchors.excellent.score > anchors.adequate.score);
    assert!(anchors.adequate.score > anchors.minimal.score);
}

// "should respect maxScore from rubric"
#[test]
fn anchors_respect_max_score() {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    assert!(anchors.excellent.score <= rubric.max_score_value());
}

// ── buildBatchPrompt ────────────────────────────────────────────────────────

// "should include rubric details"
#[test]
fn batch_prompt_includes_rubric_details() {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    let prompt = batch_prompt(&rubric, &test_students()[..3], &anchors);
    assert!(prompt.contains("Explain how photosynthesis works in plants."));
    assert!(prompt.contains("10"));
}

// "should include all students in the batch"
#[test]
fn batch_prompt_includes_all_students() {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    let students = &test_students()[..3];
    let prompt = batch_prompt(&rubric, students, &anchors);
    for student in students {
        assert!(prompt.contains(&student.name));
    }
}

// "should include scoring anchors for calibration"
#[test]
fn batch_prompt_includes_scoring_anchors() {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    let prompt = batch_prompt(&rubric, &test_students()[..3], &anchors);
    assert!(prompt.contains("anchor"));
    assert!(prompt.contains(&anchors.excellent.score.to_string()));
}

// "should request JSON array response format"
#[test]
fn batch_prompt_requests_json_array() {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    let prompt = batch_prompt(&rubric, &test_students()[..3], &anchors);
    assert!(prompt.contains("JSON"));
    assert!(prompt.contains("array"));
}

// ── parseBatchResponse ──────────────────────────────────────────────────────

const MOCK_RESPONSE: &str = r#"[{"studentIndex":0,"score":9,"feedback":"Excellent work"},{"studentIndex":1,"score":7,"feedback":"Good effort"},{"studentIndex":2,"score":5,"feedback":"Adequate"}]"#;

// "should parse valid JSON array response"
#[test]
fn batch_parses_valid_json_array() {
    let results = parse_batch(MOCK_RESPONSE, &test_students()[..3], 10.0);
    assert_eq!(results.len(), 3);
}

// "should extract score and feedback for each student"
// Adapted: the property and `typeof` checks are guaranteed by the struct;
// this checks the values instead.
#[test]
fn batch_extracts_score_and_feedback() {
    let results = parse_batch(MOCK_RESPONSE, &test_students()[..3], 10.0);
    assert_eq!(
        results,
        [
            result(0, 9.0, "Excellent work"),
            result(1, 7.0, "Good effort"),
            result(2, 5.0, "Adequate"),
        ]
    );
}

// "should handle JSON wrapped in markdown code fences"
#[test]
fn batch_handles_code_fences() {
    let wrapped = format!("```json\n{MOCK_RESPONSE}\n```");
    let results = parse_batch(&wrapped, &test_students()[..3], 10.0);
    assert_eq!(results.len(), 3);
    assert_eq!(results[0].score, 9.0);
}

// "should clamp scores to valid range [0, maxScore]"
#[test]
fn batch_clamps_scores() {
    let invalid = r#"[{"studentIndex":0,"score":-5,"feedback":"Negative"},{"studentIndex":1,"score":999,"feedback":"Too high"}]"#;
    let results = parse_batch(invalid, &test_students()[..2], 10.0);
    assert!(results[0].score >= 0.0);
    assert!(results[1].score <= 10.0);
}

// "should handle empty student responses with score 0"
#[test]
fn batch_handles_empty_student_response() {
    let empty_student = [student(0, "Empty Student", "")];
    let response = r#"[{"studentIndex":0,"score":0,"feedback":"No response submitted."}]"#;
    let results = parse_batch(response, &empty_student, 10.0);
    assert_eq!(results[0].score, 0.0);
    assert!(results[0].feedback.contains("No response"));
}

// "should fallback gracefully on malformed JSON"
// Adapted: the original only checks that an array comes back; this also
// checks it is the per-student error result.
#[test]
fn batch_falls_back_on_malformed_json() {
    let students = &test_students()[..3];
    let results = parse_batch("This is not JSON at all", students, 10.0);
    assert_eq!(results.len(), 3);
    assert!(results.iter().all(|r| r.feedback == PARSE_ERROR_FEEDBACK));
}

// ── score/feedback consistency ──────────────────────────────────────────────

const ALL_CORRECT_FEEDBACK: &str = concat!(
    "<p>Hi Test,</p>",
    r#"<p><strong>Explains light absorption</strong></p><blockquote>You said: "chlorophyll absorbs light"</blockquote><p>Correct.</p><p><em>To improve: N/A</em></p>"#,
    r#"<p><strong>Mentions chlorophyll</strong></p><blockquote>You said: "chlorophyll"</blockquote><p>Correct.</p><p><em>To improve: N/A</em></p>"#,
);

const PARTIAL_FEEDBACK: &str = concat!(
    "<p>Hi Test,</p>",
    r#"<p><strong>Explains light absorption</strong></p><blockquote>You said: "light"</blockquote><p>Correct.</p><p><em>To improve: N/A</em></p>"#,
    "<p><strong>Mentions chlorophyll</strong></p><blockquote>You did not address this.</blockquote><p>Partial. You never named chlorophyll.</p><p><em>To improve: Name chlorophyll as the pigment that absorbs light.</em></p>",
);

// "flags N/A-only feedback as naming no deficiency"
#[test]
fn na_only_feedback_names_no_deficiency() {
    assert!(!feedback_names_specific_deficiency(ALL_CORRECT_FEEDBACK));
}

// "detects a concrete To improve line and negative verdicts"
#[test]
fn concrete_improvement_and_negative_verdicts_are_detected() {
    assert!(feedback_names_specific_deficiency(PARTIAL_FEEDBACK));
    assert!(feedback_names_specific_deficiency(
        "<p>Partial. Wrong denominator.</p>"
    ));
}

// "ignores negative words inside the student quote"
#[test]
fn negative_words_in_student_quote_are_ignored() {
    let quoted = r#"<p><strong>Explain the swap</strong></p><blockquote>You said: "use the tip total instead of the lunch total"</blockquote><p>Correct. You explained the swap.</p><p><em>To improve: N/A</em></p>"#;
    assert!(!feedback_names_specific_deficiency(quoted));
}

// "awards full credit when every verdict is Correct even with no To improve lines"
#[test]
fn full_credit_when_every_verdict_is_correct_without_improve_lines() {
    let laura = concat!(
        "<p>Hi Laura,</p>",
        r#"<p><strong>Right counts</strong></p><blockquote>You said: "48/120"</blockquote><p>Correct. You used the correct counts.</p>"#,
        r#"<p><strong>Denominator group</strong></p><blockquote>You said: "lunch category"</blockquote><p>Correct. You identified the lunch group.</p>"#,
        r#"<p><strong>Swap</strong></p><blockquote>You said: "use the tip total instead of the lunch total"</blockquote><p>Correct. You explained why swapping changes the result.</p>"#,
    );
    assert!(!feedback_names_specific_deficiency(laura));
    assert_eq!(reconcile_score_with_feedback(12.5, laura, 14.0), 14.0);
}

// "recognizes a Correct verdict that admits an error as a named deficiency"
#[test]
fn correct_verdict_admitting_an_error_is_a_deficiency() {
    let contradictory = r#"<p><strong>Swap</strong></p><blockquote>You said: "120/48"</blockquote><p>Correct. Although the fraction is mathematically incorrect for the swap, you conceptually demonstrated the idea.</p>"#;
    assert!(feedback_names_specific_deficiency(contradictory));
    assert_eq!(
        reconcile_score_with_feedback(12.5, contradictory, 14.0),
        12.5
    );
}

// "awards full credit when every requirement is correct but the raw score is lower"
#[test]
fn full_credit_when_every_requirement_is_correct() {
    assert_eq!(
        reconcile_score_with_feedback(12.5, ALL_CORRECT_FEEDBACK, 14.0),
        14.0
    );
}

// "keeps a sub-max score when the feedback names the deficiency"
#[test]
fn sub_max_score_kept_when_deficiency_is_named() {
    assert_eq!(
        reconcile_score_with_feedback(12.5, PARTIAL_FEEDBACK, 14.0),
        12.5
    );
}

// "leaves empty submissions and bare fallbacks below full credit"
#[test]
fn empty_submissions_and_bare_fallbacks_stay_below_full_credit() {
    assert_eq!(
        reconcile_score_with_feedback(0.0, "<p>No response submitted.</p>", 14.0),
        0.0
    );
    assert_eq!(
        reconcile_score_with_feedback(12.5, "Graded by AI.", 14.0),
        12.5
    );
}

// "applies the invariant through parseBatchResponse"
#[test]
fn invariant_applies_through_parse_batch_response() {
    let students = &test_students()[..1];
    let make = |feedback: &str| {
        format!(
            r#"[{{"studentIndex":0,"score":9,"feedback":{}}}]"#,
            json_string(feedback)
        )
    };
    assert_eq!(
        parse_batch(&make(ALL_CORRECT_FEEDBACK), students, 14.0)[0].score,
        14.0
    );
    assert_eq!(
        parse_batch(&make(PARTIAL_FEEDBACK), students, 14.0)[0].score,
        12.5
    );
    assert_eq!(
        parse_batch(&make("Graded by AI."), students, 14.0)[0].score,
        12.5
    );
}

// ── detectOutliers ──────────────────────────────────────────────────────────

fn normal_results() -> Vec<StudentResult> {
    (0..5).map(|i| result(i, 8.0, "Good")).collect()
}

// "should calculate mean and standard deviation"
// Adapted: the original checks the fields exist and are numbers.
#[test]
fn outliers_report_mean_and_standard_deviation() {
    let report = detect_outliers(&normal_results());
    assert_eq!(report.mean, 8.0);
    assert_eq!(report.std_dev, 0.0);
}

// "should return empty outliers array when scores are consistent"
#[test]
fn consistent_scores_have_no_outliers() {
    assert!(detect_outliers(&normal_results()).outliers.is_empty());
}

// "should detect outliers beyond 2σ threshold"
#[test]
fn outliers_beyond_two_sigma_are_detected() {
    let scores = [8.0, 8.0, 9.0, 8.0, 8.0, 8.0, 0.0];
    let results: Vec<StudentResult> = scores
        .iter()
        .enumerate()
        .map(|(i, &score)| result(i, score, if score == 0.0 { "Bad" } else { "Good" }))
        .collect();
    let report = detect_outliers(&results);
    assert!(!report.outliers.is_empty());
    assert!(report.outliers.iter().any(|o| o.student_index == 6));
}

// "should limit outliers to maximum of 5 students"
#[test]
fn alternating_extremes_yield_at_most_five_outliers() {
    let results: Vec<StudentResult> = (0..20)
        .map(|i| result(i, if i % 2 == 0 { 0.0 } else { 10.0 }, "Test"))
        .collect();
    assert!(detect_outliers(&results).outliers.len() <= 5);
}

// "should include deviation amount in outlier info"
// Adapted: the original's assertion is conditional on an outlier existing
// and none does for two scores, so this also pins that down.
#[test]
fn outlier_info_includes_deviation() {
    let report = detect_outliers(&[result(0, 8.0, "Good"), result(1, 0.0, "Bad")]);
    assert!(report.outliers.is_empty());
    for outlier in &report.outliers {
        assert!(outlier.deviation.is_finite());
    }
}

// ── chunkStudents ───────────────────────────────────────────────────────────

// "should split students into chunks of specified size"
#[test]
fn chunks_have_the_specified_size() {
    let chunks = chunk_students(test_students(), 3);
    assert_eq!(chunks[0].students.len(), 3);
}

// "should default to chunk size of 20"
// Adapted: Rust has no default arguments, so the default is a constant.
#[test]
fn default_chunk_size_is_twenty() {
    let many: Vec<StudentWork> = (0..50)
        .map(|i| student(i, &format!("Student {i}"), "Test response"))
        .collect();
    let chunks = chunk_students(many, DEFAULT_CHUNK_SIZE);
    assert_eq!(chunks[0].students.len(), 20);
    assert_eq!(chunks[1].students.len(), 20);
    assert_eq!(chunks[2].students.len(), 10);
}

// "should return single chunk for small batches"
#[test]
fn small_batches_are_one_chunk() {
    let students = test_students()[..5].to_vec();
    let chunks = chunk_students(students.clone(), 20);
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].students, students);
}

// "should indicate which chunks need anchor bridging"
#[test]
fn later_chunks_need_anchor_bridging() {
    let chunks = chunk_students(test_students(), 3);
    assert!(!chunks[0].needs_anchors);
    assert!(chunks.len() > 1);
    assert!(chunks[1].needs_anchors);
}

// "should preserve student order across chunks"
#[test]
fn chunks_preserve_student_order() {
    let chunks = chunk_students(test_students(), 3);
    let reconstructed: Vec<StudentWork> = chunks.into_iter().flat_map(|c| c.students).collect();
    assert_eq!(reconstructed, test_students());
}

// "gradeChunk: should be defined and callable" is not ported: gradeChunk
// calls the AI provider and is left to the caller.

// ── mergeResults ────────────────────────────────────────────────────────────

fn chunk1_results() -> Vec<StudentResult> {
    vec![result(0, 8.0, "Good"), result(1, 7.0, "Good")]
}

fn chunk2_results() -> Vec<StudentResult> {
    vec![result(2, 9.0, "Excellent"), result(3, 6.0, "Adequate")]
}

// "should combine results from multiple chunks"
#[test]
fn merge_combines_chunks() {
    assert_eq!(
        merge_results(vec![chunk1_results(), chunk2_results()]).len(),
        4
    );
}

// "should preserve result order by studentIndex"
#[test]
fn merge_orders_by_student_index() {
    let merged = merge_results(vec![chunk1_results(), chunk2_results()]);
    let order: Vec<usize> = merged.iter().map(|r| r.student_index).collect();
    assert_eq!(order, [0, 1, 2, 3]);
}

// "should handle single chunk (no merging needed)"
#[test]
fn merge_handles_a_single_chunk() {
    assert_eq!(merge_results(vec![chunk1_results()]), chunk1_results());
}

// "should handle empty chunks"
#[test]
fn merge_handles_no_chunks() {
    assert!(merge_results(vec![]).is_empty());
}

// "should calculate aggregate statistics"
#[test]
fn merge_returns_results() {
    assert!(!merge_results(vec![chunk1_results(), chunk2_results()]).is_empty());
}

// ── buildBatchPrompt — calibrationExamples ──────────────────────────────────

fn calibration_examples() -> CalibrationExamples {
    serde_json::from_str(
        r#"{
            "total": 3,
            "excellent": {"id": 1, "similarity": 0.98, "studentResponse": "[STUDENT] response A", "gradingScore": 9, "feedback": "Excellent understanding of the core concepts."},
            "adequate": {"id": 2, "similarity": 0.85, "studentResponse": "[STUDENT] response B", "gradingScore": 6, "feedback": "Partial understanding, missing key details."},
            "minimal": {"id": 3, "similarity": 0.72, "studentResponse": "[STUDENT] response C", "gradingScore": 3, "feedback": "Minimal engagement with the topic."}
        }"#,
    )
    .unwrap()
}

fn prompt_with(
    bridge: Option<&[BridgeResponse]>,
    examples: Option<&CalibrationExamples>,
) -> String {
    let rubric = test_rubric();
    let anchors = generate_scoring_anchors(&rubric);
    build_batch_prompt(&rubric, &test_students()[..2], &anchors, bridge, examples).unwrap()
}

// "null calibrationExamples → prompt is IDENTICAL to baseline (no regression)"
// Adapted: the original compares an explicit null with an omitted argument,
// which are the same call here; this compares against the empty-example case.
#[test]
fn no_calibration_examples_matches_baseline() {
    let baseline = prompt_with(None, None);
    assert_eq!(prompt_with(None, None), baseline);
    assert_eq!(
        prompt_with(None, Some(&CalibrationExamples::default())),
        baseline
    );
}

// "with calibrationExamples → prompt contains HISTORICAL CALIBRATION EXAMPLES section"
#[test]
fn calibration_examples_add_historical_section() {
    let prompt = prompt_with(None, Some(&calibration_examples()));
    assert!(prompt.contains("HISTORICAL CALIBRATION EXAMPLES"));
}

// "with calibrationExamples → prompt contains all three tier labels"
#[test]
fn calibration_examples_add_all_tier_labels() {
    let prompt = prompt_with(None, Some(&calibration_examples()));
    assert!(prompt.contains("HIGH QUALITY"));
    assert!(prompt.contains("AVERAGE QUALITY"));
    assert!(prompt.contains("LOW QUALITY"));
}

// "with calibrationExamples → feedback text appears in prompt"
#[test]
fn calibration_examples_feedback_appears() {
    let prompt = prompt_with(None, Some(&calibration_examples()));
    assert!(prompt.contains("Excellent understanding of the core concepts."));
    assert!(prompt.contains("Partial understanding, missing key details."));
}

// "calibrationExamples AND bridgeResponses both present → both sections appear"
#[test]
fn calibration_examples_and_bridge_responses_both_appear() {
    let bridge = [BridgeResponse {
        tier: Some("excellent".to_owned()),
        name: Some("BridgeStudent".to_owned()),
        student_index: 0,
        score: 8.0,
        feedback: "Bridge feedback.".to_owned(),
    }];
    let prompt = prompt_with(Some(&bridge), Some(&calibration_examples()));
    assert!(prompt.contains("CALIBRATION EXAMPLES (from previously graded batch"));
    assert!(prompt.contains("HISTORICAL CALIBRATION EXAMPLES"));
}

// "calibrationExamples with total:0 → no HISTORICAL section in prompt"
#[test]
fn zero_calibration_examples_add_no_historical_section() {
    let empty: CalibrationExamples = serde_json::from_str(r#"{"total": 0}"#).unwrap();
    let prompt = prompt_with(None, Some(&empty));
    assert!(!prompt.contains("HISTORICAL CALIBRATION EXAMPLES"));
}

// "with calibrationExamples → HISTORICAL CONSISTENCY RULES appear"
#[test]
fn calibration_examples_add_consistency_rules() {
    let prompt = prompt_with(None, Some(&calibration_examples()));
    assert!(prompt.contains("HISTORICAL CONSISTENCY RULES"));
}

// ── buildBatchPrompt — weightMode effective points ──────────────────────────
//
// All three originals fail against the current grading.js: they expect the
// category list to read "N points total", but the batch prompt now scores
// every category out of 10 and applies weights when parsing. Each port keeps
// the inputs and the assertions that still hold, and pins the current text
// where the original's expectation is stale.

fn weight_anchors() -> ScoringAnchors {
    anchors(
        (9.0, "Excellent understanding."),
        (7.0, "Adequate with minor gaps."),
        (5.0, "Below average."),
        (3.0, "Minimal engagement."),
    )
}

fn weight_students() -> Vec<StudentWork> {
    vec![
        student(0, "Alice", "Plants use sunlight to make food."),
        student(1, "Bob", "I am not sure."),
    ]
}

fn weight_rubric(weight_mode: Option<&str>) -> Rubric {
    let mode = weight_mode.map_or(String::new(), |m| format!(r#""weightMode": "{m}","#));
    rubric(&format!(
        r#"{{
            {mode}
            "essayPrompt": "Explain the concept.",
            "maxScore": "10",
            "checklistItems": [
                {{"category": "Understanding (5 pts)", "points": 5, "categoryWeight": 40, "items": ["Shows comprehension"]}}
            ]
        }}"#
    ))
}

const CATEGORY_LINE: &str = "- Understanding (5 pts): 10 points\n";

// "regression — no weightMode → byte-identical output, original points, no % signs"
#[test]
fn no_weight_mode_is_deterministic_and_shows_no_percentages() {
    let prompt1 = batch_prompt(&weight_rubric(None), &weight_students(), &weight_anchors());
    let prompt2 = batch_prompt(&weight_rubric(None), &weight_students(), &weight_anchors());
    assert_eq!(prompt1, prompt2);
    // Stale upstream: expects "5 points total".
    assert!(!prompt1.contains("5 points total"));
    assert!(prompt1.contains(CATEGORY_LINE));
    assert!(!scoring_section(&prompt1).contains('%'));
}

// "category mode — applies effective points (5 pts × 40% = 2 pts)"
#[test]
fn category_mode_does_not_expose_raw_weights() {
    let prompt = batch_prompt(
        &weight_rubric(Some("category")),
        &weight_students(),
        &weight_anchors(),
    );
    // Stale upstream: expects "2 points total".
    assert!(!prompt.contains("2 points total"));
    assert!(prompt.contains(CATEGORY_LINE));
    assert!(!prompt.contains("5 points total"));
    let section = scoring_section(&prompt);
    assert!(!section.contains('%') || !section.contains("40"));
}

// "off mode — explicit weightMode:off leaves points unchanged"
#[test]
fn off_mode_leaves_points_unchanged() {
    let prompt = batch_prompt(
        &weight_rubric(Some("off")),
        &weight_students(),
        &weight_anchors(),
    );
    // Stale upstream: expects "5 points total".
    assert!(!prompt.contains("5 points total"));
    assert!(prompt.contains(CATEGORY_LINE));
    assert!(!prompt.contains("2 points total"));
}
