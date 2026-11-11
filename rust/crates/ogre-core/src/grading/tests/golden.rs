//! Differential tests against the JavaScript implementation.
//!
//! `golden.json` holds inputs together with what the grading server's
//! `grading.js` (as of commit f436abb) returned for them, captured by running
//! it under Node. It is a sample of a larger generated set. Prompts
//! are compared byte for byte.

use std::collections::BTreeMap;
use std::fmt::Debug;

use serde::Deserialize;

use crate::grading::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Golden {
    batch_prompts: Vec<PromptCase<BatchArgs>>,
    single_prompts: Vec<PromptCase<SingleArgs>>,
    outlier_prompts: Vec<PromptCase<OutlierArgs>>,
    compact_prompts: Vec<PromptCase<SweepArgs>>,
    pairwise_prompts: Vec<PromptCase<SweepArgs>>,
    anchors: Vec<AnchorCase>,
    deficiency: Vec<DeficiencyCase>,
    reconcile: Vec<ReconcileCase>,
    first_name: Vec<FirstNameCase>,
    parse_batch: Vec<ParseBatchCase>,
    parse_single: Vec<ParseSingleCase>,
    outliers: Vec<OutlierCase>,
    chunk_by_prompt: Vec<ChunkCase>,
}

#[derive(Deserialize)]
struct PromptCase<A> {
    name: String,
    args: A,
    expected: PromptOutcome,
}

/// What the JavaScript produced: a prompt, a list of band prompts, or a
/// thrown error.
#[derive(Deserialize)]
struct PromptOutcome {
    #[serde(default)]
    throws: bool,
    text: Option<String>,
    bands: Option<Vec<BandPrompt>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchArgs {
    rubric: Rubric,
    students: Vec<StudentWork>,
    anchors: ScoringAnchors,
    bridge_responses: Option<Vec<BridgeResponse>>,
    calibration_examples: Option<CalibrationExamples>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SingleArgs {
    rubric: Rubric,
    student_work: String,
    instructions: String,
    constants: Option<GradingConstants>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlierArgs {
    rubric: Rubric,
    outlier_students: Vec<OutlierStudent>,
    anchors: ScoringAnchors,
    stats: BatchStats,
    max_score: f64,
    all_results: Vec<PeerResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SweepArgs {
    results: Vec<StudentResult>,
    students: Vec<StudentWork>,
    anchors: ScoringAnchors,
    chunk_map: BTreeMap<usize, usize>,
    max_score: f64,
    rubric: Rubric,
}

#[derive(Deserialize)]
struct AnchorCase {
    rubric: Rubric,
    expected: ScoringAnchors,
}

#[derive(Deserialize)]
struct DeficiencyCase {
    feedback: String,
    expected: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReconcileCase {
    score: f64,
    feedback: String,
    max_score: f64,
    expected: f64,
}

#[derive(Deserialize)]
struct FirstNameCase {
    name: String,
    expected: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParseBatchCase {
    ai_text: String,
    students: Vec<StudentWork>,
    max_score: f64,
    category_weights: Option<WeightMap>,
    category_max_points: Option<WeightMap>,
    expected: ParseBatchOutcome,
}

#[derive(Deserialize)]
struct ParseBatchOutcome {
    #[serde(default)]
    throws: bool,
    results: Option<Vec<StudentResult>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParseSingleCase {
    ai_text: String,
    max_score: f64,
    category_weights: Option<WeightMap>,
    category_max_points: Option<WeightMap>,
    student_name: Option<String>,
    expected: ParseSingleOutcome,
}

#[derive(Deserialize)]
struct ParseSingleOutcome {
    grade: SingleGrade,
}

#[derive(Deserialize)]
struct OutlierCase {
    results: Vec<StudentResult>,
    expected: OutlierReport,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChunkCase {
    students: Vec<StudentWork>,
    chunk_size: usize,
    fallback_prompt: String,
    expected: Vec<Chunk>,
}

fn weighting(
    weights: Option<WeightMap>,
    max_points: Option<WeightMap>,
) -> Option<CategoryWeighting> {
    weights.map(|weights| CategoryWeighting {
        weights,
        max_points,
    })
}

/// Collects mismatches so one run reports every failing case.
#[derive(Default)]
struct Report {
    checked: usize,
    failures: Vec<String>,
}

impl Report {
    fn check<T: PartialEq + Debug>(&mut self, case: &str, actual: &T, expected: &T) {
        self.checked += 1;
        if actual != expected {
            self.failures.push(format!(
                "{case}\n  expected: {}\n  actual:   {}",
                excerpt(expected, actual),
                excerpt(actual, expected)
            ));
        }
    }

    fn check_prompt(
        &mut self,
        case: &str,
        actual: Result<String, GradingError>,
        expected: &PromptOutcome,
    ) {
        match (actual, &expected.text) {
            (Ok(actual), Some(text)) => self.check(case, &actual, text),
            (Err(_), None) if expected.throws => self.checked += 1,
            (actual, _) => self.failures.push(format!(
                "{case}: JavaScript threw = {}, Rust returned {:?}",
                expected.throws,
                actual.map(|_| "a prompt")
            )),
        }
    }
}

/// The part of `value`'s debug form around where it first differs from
/// `other`'s.
fn excerpt<T: Debug>(value: &T, other: &T) -> String {
    let (value, other) = (format!("{value:?}"), format!("{other:?}"));
    let common = value
        .chars()
        .zip(other.chars())
        .take_while(|(a, b)| a == b)
        .count();
    let shown: String = value
        .chars()
        .skip(common.saturating_sub(60))
        .take(200)
        .collect();
    format!("[{common} chars in] {shown}")
}

#[test]
fn matches_the_javascript_implementation() {
    let golden: Golden = serde_json::from_str(include_str!("golden.json")).unwrap();
    let mut report = Report::default();

    for case in &golden.batch_prompts {
        let args = &case.args;
        let actual = build_batch_prompt(
            &args.rubric,
            &args.students,
            &args.anchors,
            args.bridge_responses.as_deref(),
            args.calibration_examples.as_ref(),
        );
        report.check_prompt(
            &format!("batch prompt {}", case.name),
            actual,
            &case.expected,
        );
    }
    for case in &golden.single_prompts {
        let args = &case.args;
        let actual = build_single_grade_prompt(
            &args.rubric,
            &args.student_work,
            &args.instructions,
            args.constants.as_ref(),
        );
        report.check_prompt(
            &format!("single prompt {}", case.name),
            actual,
            &case.expected,
        );
    }
    for case in &golden.outlier_prompts {
        let args = &case.args;
        let actual = build_outlier_review_prompt(
            &args.rubric,
            &args.outlier_students,
            &args.anchors,
            &args.stats,
            args.max_score,
            &args.all_results,
        );
        report.check_prompt(
            &format!("outlier prompt {}", case.name),
            Ok(actual),
            &case.expected,
        );
    }
    for case in &golden.compact_prompts {
        let args = &case.args;
        let actual = build_compact_sweep_prompt(
            &args.results,
            &args.students,
            &args.anchors,
            &args.chunk_map,
            args.max_score,
            &args.rubric,
        );
        report.check_prompt(
            &format!("compact sweep {}", case.name),
            Ok(actual),
            &case.expected,
        );
    }
    for case in &golden.pairwise_prompts {
        let args = &case.args;
        let actual = build_pairwise_sweep_prompts(
            &args.results,
            &args.students,
            &args.anchors,
            args.max_score,
            &args.rubric,
        );
        let expected = case
            .expected
            .bands
            .as_ref()
            .expect("pairwise cases list bands");
        report.check(&format!("pairwise sweep {}", case.name), &actual, expected);
    }

    for case in &golden.anchors {
        let actual = generate_scoring_anchors(&case.rubric);
        report.check(
            &format!("anchors for {:?}", case.rubric.max_score),
            &actual,
            &case.expected,
        );
    }
    for case in &golden.deficiency {
        let actual = feedback_names_specific_deficiency(&case.feedback);
        report.check(
            &format!("deficiency in {:?}", case.feedback),
            &actual,
            &case.expected,
        );
    }
    for case in &golden.reconcile {
        let actual = reconcile_score_with_feedback(case.score, &case.feedback, case.max_score);
        let name = format!(
            "reconcile {}/{} with {:?}",
            case.score, case.max_score, case.feedback
        );
        report.check(&name, &actual, &case.expected);
    }
    for case in &golden.first_name {
        let actual = extract_first_name(&case.name).to_owned();
        report.check(
            &format!("first name of {:?}", case.name),
            &actual,
            &case.expected,
        );
    }

    for (number, case) in golden.parse_batch.into_iter().enumerate() {
        let weighting = weighting(case.category_weights, case.category_max_points);
        let actual = parse_batch_response(
            &case.ai_text,
            &case.students,
            case.max_score,
            weighting.as_ref(),
        );
        let name = format!(
            "batch response #{number} (max {}) {:?}",
            case.max_score, case.ai_text
        );
        match (actual, case.expected.results) {
            (Ok(actual), Some(expected)) => report.check(&name, &actual, &expected),
            (Err(_), None) if case.expected.throws => report.checked += 1,
            (actual, _) => report.failures.push(format!(
                "{name}: JavaScript threw = {}, Rust returned {actual:?}",
                case.expected.throws
            )),
        }
    }
    for (number, case) in golden.parse_single.into_iter().enumerate() {
        let weighting = weighting(case.category_weights, case.category_max_points);
        let actual = parse_single_grade_response(
            &case.ai_text,
            case.max_score,
            weighting.as_ref(),
            case.student_name.as_deref(),
        );
        let name = format!(
            "single response #{number} (max {}) {:?}",
            case.max_score, case.ai_text
        );
        report.check(&name, &actual, &case.expected.grade);
    }

    for (number, case) in golden.outliers.iter().enumerate() {
        let actual = detect_outliers(&case.results);
        report.check(&format!("outliers #{number}"), &actual, &case.expected);
    }
    for (number, case) in golden.chunk_by_prompt.into_iter().enumerate() {
        let actual =
            chunk_students_by_prompt(case.students, case.chunk_size, &case.fallback_prompt);
        report.check(
            &format!("chunks by prompt #{number}"),
            &actual,
            &case.expected,
        );
    }

    assert!(
        report.failures.is_empty(),
        "{} of {} cases differ from the JavaScript:\n\n{}",
        report.failures.len(),
        report.checked + report.failures.len(),
        report
            .failures
            .iter()
            .take(12)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n")
    );
    assert!(report.checked > 500, "only {} cases ran", report.checked);
}
