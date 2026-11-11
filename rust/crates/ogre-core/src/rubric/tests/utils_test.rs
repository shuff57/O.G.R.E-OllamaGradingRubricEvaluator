//! Port of `ogre-desktop/src/lib/rubric-utils.test.ts`, one test per `it`,
//! in the original's order. Each test is headed by the original's name.
//!
//! Vitest's `toEqual` ignores absent fields; the comparisons here are on
//! whole values, which is stricter. `toBeCloseTo(x)` is "within 0.005".
//! The "does not mutate" cases cannot fail in Rust, where the functions
//! borrow their input; they are kept so the count matches.

use super::*;

const CATEGORY: WeightMode = WeightMode::Category;
const CRITERION: WeightMode = WeightMode::Criterion;

fn close_to(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() < 0.005
}

/// A criterion with no description, in a category.
fn in_category(criteria: &str, points: f64, category: &str) -> RubricCriterion {
    criterion(criteria, "", points).category(category)
}

fn sum_of(validation: &WeightValidation) -> f64 {
    validation.sum.expect("a non-empty rubric has a sum")
}

// ── criteriaToText ──────────────────────────────────────────────────────

// "serializes a single criterion with description"
#[test]
fn to_text_single_criterion_with_description() {
    let criteria = [criterion(
        "Writing Quality",
        "Clear grammar and style",
        10.0,
    )];
    assert_eq!(
        criteria_to_text(&criteria),
        "Writing Quality (10pts): Clear grammar and style"
    );
}

// "serializes a single criterion without description"
#[test]
fn to_text_single_criterion_without_description() {
    let criteria = [criterion("Argument Strength", "", 15.0)];
    assert_eq!(criteria_to_text(&criteria), "Argument Strength (15pts)");
}

// "serializes multiple criteria as newline-separated lines"
#[test]
fn to_text_multiple_criteria_on_separate_lines() {
    let criteria = [
        criterion("Writing Quality", "Clear grammar", 10.0),
        criterion("Argument Strength", "Thesis supported", 15.0),
        criterion("Analysis", "", 5.0),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "Writing Quality (10pts): Clear grammar\nArgument Strength (15pts): Thesis supported\nAnalysis (5pts)"
    );
}

// "handles decimal point values"
#[test]
fn to_text_decimal_points() {
    let criteria = [criterion("Partial Credit", "Half points allowed", 7.5)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Partial Credit (7.5pts): Half points allowed"
    );
}

// "returns empty string for empty array"
#[test]
fn to_text_empty() {
    assert_eq!(criteria_to_text(&[]), "");
}

// "trims whitespace from criteria name and description"
#[test]
fn to_text_trims_name_and_description() {
    let criteria = [criterion("  Padded Name  ", "  padded desc  ", 5.0)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Padded Name (5pts): padded desc"
    );
}

// "uses 'Unnamed' for empty criteria name"
#[test]
fn to_text_unnamed() {
    let criteria = [criterion("", "some desc", 3.0)];
    assert_eq!(criteria_to_text(&criteria), "Unnamed (3pts): some desc");
}

// "handles zero points"
#[test]
fn to_text_zero_points() {
    let criteria = [criterion("Bonus", "Optional", 0.0)];
    assert_eq!(criteria_to_text(&criteria), "Bonus (0pts): Optional");
}

// ── textToCriteria ──────────────────────────────────────────────────────

// "parses a single line with description"
#[test]
fn parse_single_line_with_description() {
    assert_eq!(
        text_to_criteria("Writing Quality (10pts): Clear grammar and style"),
        [criterion(
            "Writing Quality",
            "Clear grammar and style",
            10.0
        )]
    );
}

// "parses a line without description"
#[test]
fn parse_line_without_description() {
    assert_eq!(
        text_to_criteria("Analysis (5pts)"),
        [criterion("Analysis", "", 5.0)]
    );
}

// "parses multiple lines"
#[test]
fn parse_multiple_lines() {
    let text = [
        "Writing Quality (10pts): Clear grammar",
        "Argument Strength (15pts): Thesis supported",
        "Analysis (5pts)",
    ]
    .join("\n");
    assert_eq!(
        text_to_criteria(&text),
        [
            criterion("Writing Quality", "Clear grammar", 10.0),
            criterion("Argument Strength", "Thesis supported", 15.0),
            criterion("Analysis", "", 5.0),
        ]
    );
}

// "skips blank lines"
#[test]
fn parse_skips_blank_lines() {
    let result = text_to_criteria("\nWriting Quality (10pts): Clear grammar\n\nAnalysis (5pts)\n");
    assert_eq!(result.len(), 2);
}

// "skips lines with no recognizable pts pattern"
#[test]
fn parse_skips_lines_without_points() {
    let result = text_to_criteria("This line has no points\nWriting Quality (10pts): OK");
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].criteria, "Writing Quality");
}

// "handles decimal points"
#[test]
fn parse_decimal_points() {
    assert_eq!(
        text_to_criteria("Partial Credit (7.5pts): Half points"),
        [criterion("Partial Credit", "Half points", 7.5)]
    );
}

// "handles '(N pts)' with a space before pts"
#[test]
fn parse_space_before_pts() {
    assert_eq!(
        text_to_criteria("Clarity (10 pts): Well written"),
        [criterion("Clarity", "Well written", 10.0)]
    );
}

// "is case-insensitive for pts suffix"
#[test]
fn parse_pts_in_any_case() {
    assert_eq!(
        text_to_criteria("Clarity (10PTS): Well written"),
        [criterion("Clarity", "Well written", 10.0)]
    );
}

// "returns empty array for empty string"
#[test]
fn parse_empty_string() {
    assert_eq!(text_to_criteria(""), []);
}

// "returns empty array for all-blank input"
#[test]
fn parse_all_blank() {
    assert_eq!(text_to_criteria("   \n  \n  "), []);
}

// "handles description with colons in it"
#[test]
fn parse_description_with_colons() {
    let result = text_to_criteria("Rubric Item (5pts): Must include: examples and: evidence");
    assert_eq!(
        result[0].description,
        "Must include: examples and: evidence"
    );
}

// "trims whitespace from parsed fields"
#[test]
fn parse_trims_fields() {
    let result = text_to_criteria("  Writing Quality  (10pts):   Clear grammar  ");
    assert_eq!(result[0].criteria, "Writing Quality");
    assert_eq!(result[0].description, "Clear grammar");
}

// "defaults points to 0 when value is missing (edge case)"
#[test]
fn parse_zero_points() {
    let result = text_to_criteria("Weird Item (0pts): zero");
    assert_eq!(result[0].points, 0.0);
}

// ── criteriaToText → textToCriteria round-trip ──────────────────────────

// "round-trips a full rubric correctly"
#[test]
fn round_trip_full_rubric() {
    let original = [
        criterion("Writing Quality", "Clear grammar and style", 10.0),
        criterion(
            "Argument Strength",
            "Thesis is supported with evidence",
            15.0,
        ),
        criterion("Analysis", "", 5.0),
        criterion("Half Point Item", "Partial credit", 7.5),
    ];
    assert_eq!(text_to_criteria(&criteria_to_text(&original)), original);
}

// ── hasUnsavedChanges ───────────────────────────────────────────────────

fn saved() -> [RubricCriterion; 1] {
    [criterion("Writing Quality", "Clear grammar", 10.0)]
}

// "returns false when text matches original"
#[test]
fn unsaved_false_when_text_matches() {
    let text = criteria_to_text(&saved());
    assert!(!has_unsaved_changes(&text, &saved()));
}

// "returns true when text differs from original"
#[test]
fn unsaved_true_when_text_differs() {
    assert!(has_unsaved_changes(
        "Writing Quality (20pts): Changed",
        &saved()
    ));
}

// "returns false when text has leading/trailing whitespace only"
#[test]
fn unsaved_ignores_surrounding_whitespace() {
    let text = format!("  {}  ", criteria_to_text(&saved()));
    assert!(!has_unsaved_changes(&text, &saved()));
}

// "returns true when a criterion is added in text"
#[test]
fn unsaved_true_when_criterion_added() {
    let text = format!("{}\nNew Item (5pts): Added", criteria_to_text(&saved()));
    assert!(has_unsaved_changes(&text, &saved()));
}

// ── criteriaToText — weight serialization ───────────────────────────────

// "includes criterionWeight when set"
#[test]
fn to_text_includes_criterion_weight() {
    let criteria = [criterion("Writing Quality", "Clear grammar", 10.0).criterion_weight(25.0)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Writing Quality (10pts, 25%): Clear grammar"
    );
}

// "omits weight when criterionWeight is undefined (backward compat)"
#[test]
fn to_text_omits_absent_weight() {
    let criteria = [criterion("Writing Quality", "Clear grammar", 10.0)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Writing Quality (10pts): Clear grammar"
    );
}

// "omits weight when criterionWeight is undefined — no description"
#[test]
fn to_text_omits_absent_weight_without_description() {
    let criteria = [criterion("Analysis", "", 5.0)];
    assert_eq!(criteria_to_text(&criteria), "Analysis (5pts)");
}

// "includes criterionWeight with no description"
#[test]
fn to_text_weight_without_description() {
    let criteria = [criterion("Analysis", "", 5.0).criterion_weight(50.0)];
    assert_eq!(criteria_to_text(&criteria), "Analysis (5pts, 50%)");
}

// "handles 0% criterionWeight"
#[test]
fn to_text_zero_percent_weight() {
    let criteria = [criterion("Bonus", "Optional", 0.0).criterion_weight(0.0)];
    assert_eq!(criteria_to_text(&criteria), "Bonus (0pts, 0%): Optional");
}

// "handles 100% criterionWeight"
#[test]
fn to_text_hundred_percent_weight() {
    let criteria = [criterion("Only Criterion", "Everything", 10.0).criterion_weight(100.0)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Only Criterion (10pts, 100%): Everything"
    );
}

// "handles decimal criterionWeight like 33.3%"
#[test]
fn to_text_decimal_weight() {
    let criteria = [criterion("Third", "One third", 10.0).criterion_weight(33.3)];
    assert_eq!(
        criteria_to_text(&criteria),
        "Third (10pts, 33.3%): One third"
    );
}

// "emits category header before first criterion in a group"
#[test]
fn to_text_category_header_before_group() {
    let criteria = [
        criterion("Writing Quality", "Clear grammar", 10.0).category("Writing"),
        criterion("Style", "Concise", 5.0).category("Writing"),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "## Writing\nWriting Quality (10pts): Clear grammar\nStyle (5pts): Concise"
    );
}

// "emits multiple category headers for distinct categories"
#[test]
fn to_text_header_per_category() {
    let criteria = [
        criterion("Writing Quality", "Clear grammar", 10.0).category("Writing"),
        criterion("Math Work", "Correct steps", 15.0).category("Math"),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "## Writing\nWriting Quality (10pts): Clear grammar\n## Math\nMath Work (15pts): Correct steps"
    );
}

// "only emits header when category changes (not per criterion)"
#[test]
fn to_text_header_only_on_change() {
    let criteria = [
        in_category("A", 5.0, "Cat1"),
        in_category("B", 5.0, "Cat1"),
        in_category("C", 5.0, "Cat2"),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "## Cat1\nA (5pts)\nB (5pts)\n## Cat2\nC (5pts)"
    );
}

// "does not emit header when category is undefined"
#[test]
fn to_text_no_header_without_category() {
    let criteria = [
        criterion("Writing Quality", "Clear grammar", 10.0),
        criterion("Analysis", "Insightful", 8.0),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "Writing Quality (10pts): Clear grammar\nAnalysis (8pts): Insightful"
    );
}

// "round-trips criteriaToText(textToCriteria(text)) === text for weighted format"
#[test]
fn to_text_round_trips_weighted_text() {
    let text = "## Writing\nWriting Quality (10pts, 25%): Clear grammar\n## Math\nMath Work (15pts, 75%): Correct steps";
    assert_eq!(criteria_to_text(&text_to_criteria(text)), text);
}

// "combined: weight + category"
#[test]
fn to_text_weight_and_category() {
    let criteria = [
        criterion("Writing Quality", "Clear grammar", 10.0)
            .category("Writing")
            .criterion_weight(25.0),
        criterion("Math Work", "Correct steps", 15.0)
            .category("Math")
            .criterion_weight(75.0),
    ];
    assert_eq!(
        criteria_to_text(&criteria),
        "## Writing\nWriting Quality (10pts, 25%): Clear grammar\n## Math\nMath Work (15pts, 75%): Correct steps"
    );
}

// ── textToCriteria — weight and category parsing ────────────────────────

// "parses criterionWeight from 'Name (10pts, 25%): Desc'"
#[test]
fn parse_criterion_weight() {
    assert_eq!(
        text_to_criteria("Writing Quality (10pts, 25%): Clear grammar"),
        [criterion("Writing Quality", "Clear grammar", 10.0).criterion_weight(25.0)]
    );
}

// "produces criterionWeight: undefined for old format 'Name (10pts): Desc'"
#[test]
fn parse_no_criterion_weight_in_old_format() {
    let result = text_to_criteria("Writing Quality (10pts): Clear grammar");
    assert_eq!(result[0].criterion_weight, None);
}

// "produces category: undefined for line without ## header"
#[test]
fn parse_no_category_without_header() {
    let result = text_to_criteria("Writing Quality (10pts): Clear grammar");
    assert_eq!(result[0].category, None);
}

// "parses category from ## header lines"
#[test]
fn parse_category_from_header() {
    assert_eq!(
        text_to_criteria("## Writing\nWriting Quality (10pts): Clear grammar"),
        [criterion("Writing Quality", "Clear grammar", 10.0).category("Writing")]
    );
}

// "assigns category to all criteria following the header until next header"
#[test]
fn parse_category_applies_until_next_header() {
    let result = text_to_criteria(
        "## Writing\nA (5pts): First\nB (5pts): Second\n## Math\nC (10pts): Third",
    );
    assert_eq!(result[0].category.as_deref(), Some("Writing"));
    assert_eq!(result[1].category.as_deref(), Some("Writing"));
    assert_eq!(result[2].category.as_deref(), Some("Math"));
}

// "handles 0% weight"
#[test]
fn parse_zero_percent_weight() {
    let result = text_to_criteria("Bonus (0pts, 0%): Optional");
    assert_eq!(result[0].criterion_weight, Some(0.0));
    assert_eq!(result[0].points, 0.0);
}

// "handles 100% weight"
#[test]
fn parse_hundred_percent_weight() {
    let result = text_to_criteria("Only Criterion (10pts, 100%): Everything");
    assert_eq!(result[0].criterion_weight, Some(100.0));
}

// "handles decimal weight like 33.3%"
#[test]
fn parse_decimal_weight() {
    let result = text_to_criteria("Third (10pts, 33.3%): One third");
    assert_eq!(result[0].criterion_weight, Some(33.3));
}

// "parses weight without description"
#[test]
fn parse_weight_without_description() {
    let result = text_to_criteria("Analysis (5pts, 50%)");
    assert_eq!(result[0].criterion_weight, Some(50.0));
    assert_eq!(result[0].description, "");
}

// "parses weight with category"
#[test]
fn parse_weight_with_category() {
    let result = text_to_criteria("## Math\nMath Work (15pts, 75%): Correct steps");
    assert_eq!(result[0].category.as_deref(), Some("Math"));
    assert_eq!(result[0].criterion_weight, Some(75.0));
    assert_eq!(result[0].points, 15.0);
    assert_eq!(result[0].description, "Correct steps");
}

// "old format parses identically to pre-change behavior (backward compat)"
#[test]
fn parse_old_format_unchanged() {
    let text = [
        "Writing Quality (10pts): Clear grammar",
        "Argument Strength (15pts): Thesis supported",
        "Analysis (5pts)",
    ]
    .join("\n");
    assert_eq!(
        text_to_criteria(&text),
        [
            criterion("Writing Quality", "Clear grammar", 10.0),
            criterion("Argument Strength", "Thesis supported", 15.0),
            criterion("Analysis", "", 5.0),
        ]
    );
}

// ── round-trip and edge cases ───────────────────────────────────────────

// "round-trips 3 criteria with different point values"
#[test]
fn round_trip_three_criteria() {
    let criteria = [
        criterion("Mathematical Reasoning", "Shows clear logical steps", 5.0),
        criterion("Accuracy", "Correct final answer", 10.0),
        criterion("Presentation", "Neat and organized", 3.0),
    ];
    assert_eq!(text_to_criteria(&criteria_to_text(&criteria)), criteria);
}

// "criteriaToText returns empty string for empty array"
#[test]
fn edge_to_text_empty() {
    assert_eq!(criteria_to_text(&[]), "");
}

// "textToCriteria returns empty array for empty string"
#[test]
fn edge_parse_empty() {
    assert_eq!(text_to_criteria(""), []);
}

// "textToCriteria returns empty array for random text without format"
#[test]
fn edge_parse_unformatted_text() {
    assert_eq!(text_to_criteria("random text without format"), []);
}

fn two_saved() -> [RubricCriterion; 2] {
    [
        criterion("Writing Quality", "Clear grammar", 10.0),
        criterion("Analysis", "Insightful", 8.0),
    ]
}

// "hasUnsavedChanges returns true when point values differ"
#[test]
fn edge_unsaved_when_points_differ() {
    let modified = "Writing Quality (10pts): Clear grammar\nAnalysis (15pts): Insightful";
    assert!(has_unsaved_changes(modified, &two_saved()));
}

// "hasUnsavedChanges returns false when criteria are identical"
#[test]
fn edge_saved_when_identical() {
    let identical = criteria_to_text(&two_saved());
    assert!(!has_unsaved_changes(&identical, &two_saved()));
}

// ── criterionWeight round-trip ──────────────────────────────────────────

// "preserves criterionWeight through textToCriteria → criteriaToText"
#[test]
fn criterion_weight_survives_round_trip() {
    let weighted = |name: &str, description: &str, category: &str, weight: f64| {
        criterion(name, description, 5.0)
            .category(category)
            .criterion_weight(weight)
    };
    let criteria = [
        weighted("Thesis", "Clear thesis statement", "Writing", 30.0),
        weighted("Evidence", "Uses evidence", "Writing", 40.0),
        weighted("Grammar", "Correct grammar", "Writing", 30.0),
        weighted("Setup", "Correct setup", "Math", 50.0),
        weighted("Calculation", "Correct calc", "Math", 50.0),
    ];
    let parsed = text_to_criteria(&criteria_to_text(&criteria));
    assert_eq!(parsed.len(), 5);
    for (parsed, original) in parsed.iter().zip(&criteria) {
        assert_eq!(parsed.criteria, original.criteria);
        assert_eq!(parsed.criterion_weight, original.criterion_weight);
        assert_eq!(parsed.category, original.category);
    }
}

// ── getFullCreditPoints ─────────────────────────────────────────────────

// "maps non-allocation rows to their Full allocation points"
#[test]
fn full_credit_maps_rows_to_their_full_allocation() {
    let allocation = |name: &str, points: f64, description: &str| {
        criterion(name, description, points)
            .category("Writing")
            .allocation()
    };
    let criteria = [
        in_category("Thesis Statement", 0.0, "Writing"),
        allocation("Full (2pts)", 2.0, "Complete thesis"),
        allocation("Partial (1pts)", 1.0, "Incomplete thesis"),
        allocation("Missing (0pts)", 0.0, "No thesis"),
        in_category("Evidence", 0.0, "Writing"),
        allocation("Full (3pts)", 3.0, "Strong evidence"),
        allocation("Missing (0pts)", 0.0, "No evidence"),
    ];
    let result = full_credit_points(&criteria);
    assert_eq!(result.get(&0), Some(&2.0));
    assert_eq!(result.get(&4), Some(&3.0));
    assert!(!result.contains_key(&1));
    assert!(!result.contains_key(&2));
}

// "returns empty map for criteria without allocation rows"
#[test]
fn full_credit_empty_without_allocation_rows() {
    let criteria = [
        criterion("Thesis", "A thesis", 5.0),
        criterion("Evidence", "Evidence", 5.0),
    ];
    assert!(full_credit_points(&criteria).is_empty());
}

// ── validateWeights ─────────────────────────────────────────────────────

fn weighted_category(name: &str, points: f64, category: &str, weight: f64) -> RubricCriterion {
    in_category(name, points, category).category_weight(weight)
}

fn weighted_criterion(name: &str, category: &str, weight: f64) -> RubricCriterion {
    in_category(name, 5.0, category).criterion_weight(weight)
}

const EMPTY_IS_VALID: WeightValidation = WeightValidation {
    valid: true,
    sum: None,
    errors: Vec::new(),
};

// "returns valid:true for empty criteria array (category mode)"
#[test]
fn validate_empty_by_category() {
    assert_eq!(validate_weights(&[], CATEGORY), EMPTY_IS_VALID);
}

// "returns valid:true when category weights sum to exactly 100 (category mode)"
#[test]
fn validate_category_weights_summing_to_100() {
    let criteria = [
        weighted_category("Writing", 10.0, "Writing", 60.0),
        weighted_category("Math", 10.0, "Math", 40.0),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(result.valid);
    assert!(result.errors.is_empty());
    assert!(close_to(sum_of(&result), 100.0));
}

// "returns valid:true when category weights sum to 100.4 (within tolerance)"
#[test]
fn validate_category_weights_within_tolerance() {
    let criteria = [
        weighted_category("A", 5.0, "A", 50.2),
        weighted_category("B", 5.0, "B", 50.2),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(result.valid);
    assert!(result.errors.is_empty());
}

// "returns valid:false with error when category weights sum to 85 (category mode)"
#[test]
fn validate_category_weights_summing_to_85() {
    let criteria = [
        weighted_category("Writing", 10.0, "Writing", 50.0),
        weighted_category("Math", 10.0, "Math", 35.0),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(!result.valid);
    assert_eq!(result.errors.len(), 1);
    assert!(result.errors[0].contains("85"));
    assert!(close_to(sum_of(&result), 85.0));
}

// "returns valid:false when no categoryWeight fields are set (category mode)"
#[test]
fn validate_category_weights_absent() {
    let criteria = [
        in_category("Writing", 10.0, "Writing"),
        in_category("Math", 10.0, "Math"),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(!result.valid);
    assert_eq!(result.errors.len(), 1);
    assert!(close_to(sum_of(&result), 0.0));
}

// "handles floating point: 33.3 + 33.3 + 33.4 = 100 (category mode)"
#[test]
fn validate_category_weights_with_decimals() {
    let criteria = [
        weighted_category("A1", 5.0, "A", 33.3),
        weighted_category("A2", 5.0, "A", 33.3),
        weighted_category("B1", 5.0, "B", 33.3),
        weighted_category("C1", 5.0, "C", 33.4),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(result.valid);
    assert!(result.errors.is_empty());
}

// "sums ONE categoryWeight per unique category (not per criterion) (category mode)"
#[test]
fn validate_counts_one_weight_per_category() {
    let criteria = [
        weighted_category("W1", 5.0, "Writing", 60.0),
        weighted_category("W2", 5.0, "Writing", 60.0),
        weighted_category("M1", 5.0, "Math", 40.0),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(result.valid);
    assert!(close_to(sum_of(&result), 100.0));
}

// "returns valid:true for empty criteria array (criterion mode)"
#[test]
fn validate_empty_by_criterion() {
    assert_eq!(validate_weights(&[], CRITERION), EMPTY_IS_VALID);
}

// "returns valid:true when all criteria weights sum to 100 (criterion mode)"
#[test]
fn validate_criterion_weights_summing_to_100() {
    let criteria = [
        weighted_criterion("W1", "Writing", 20.0),
        weighted_criterion("W2", "Writing", 30.0),
        weighted_criterion("M1", "Math", 35.0),
        weighted_criterion("M2", "Math", 15.0),
    ];
    let result = validate_weights(&criteria, CRITERION);
    assert!(result.valid);
    assert!(result.errors.is_empty());
}

fn sixty_and_thirty() -> [RubricCriterion; 2] {
    [
        weighted_criterion("W1", "Writing", 60.0),
        weighted_criterion("W2", "Writing", 30.0),
    ]
}

// "returns valid:false when criteria weights sum to 90 (criterion mode)"
#[test]
fn validate_criterion_weights_summing_to_90() {
    let result = validate_weights(&sixty_and_thirty(), CRITERION);
    assert!(!result.valid);
    assert_eq!(result.errors.len(), 1);
    assert!(result.errors[0].contains("90"));
}

// "error message mentions total criteria weights (criterion mode)"
#[test]
fn validate_criterion_error_names_criteria_weights() {
    let result = validate_weights(&sixty_and_thirty(), CRITERION);
    assert!(!result.valid);
    assert!(result.errors[0].contains("Criteria weights"));
}

// "returns valid:true for single criterion at 100% (criterion mode)"
#[test]
fn validate_single_criterion_at_100() {
    let criteria = [weighted_criterion("W1", "Writing", 100.0)];
    let result = validate_weights(&criteria, CRITERION);
    assert!(result.valid);
    assert!(result.errors.is_empty());
}

// "returns valid:false when criteria weights across all categories sum to 190 (criterion mode)"
#[test]
fn validate_criterion_weights_summed_across_categories() {
    let criteria = [
        weighted_criterion("W1", "Writing", 60.0),
        weighted_criterion("W2", "Writing", 40.0),
        weighted_criterion("M1", "Math", 50.0),
        weighted_criterion("M2", "Math", 40.0),
    ];
    let result = validate_weights(&criteria, CRITERION);
    assert!(!result.valid);
    assert!(close_to(sum_of(&result), 190.0));
}

// "includes the actual sum % in category mode error message"
#[test]
fn validate_category_error_includes_sum() {
    let criteria = [
        weighted_category("A", 5.0, "A", 40.0),
        weighted_category("B", 5.0, "B", 30.0),
    ];
    let result = validate_weights(&criteria, CATEGORY);
    assert!(!result.valid);
    assert!(result.errors[0].contains("70"));
}

// "handles criteria with undefined criterionWeight as 0 in criterion mode"
#[test]
fn validate_absent_criterion_weight_counts_as_zero() {
    let criteria = [
        in_category("W1", 5.0, "Writing"),
        in_category("W2", 5.0, "Writing"),
    ];
    let result = validate_weights(&criteria, CRITERION);
    assert!(!result.valid);
    assert!(result.errors[0].contains('0'));
}

// "does not mutate the input criteria array"
#[test]
fn validate_leaves_input_alone() {
    let criteria = [weighted_category("A", 5.0, "A", 100.0)];
    let original = criteria.clone();
    validate_weights(&criteria, CATEGORY);
    validate_weights(&criteria, CRITERION);
    assert_eq!(criteria, original);
}

// ── equalizeWeights ─────────────────────────────────────────────────────

// "distributes weights equally across categories (category mode)"
#[test]
fn equalize_across_categories() {
    let criteria = [
        in_category("A1", 5.0, "A"),
        in_category("A2", 5.0, "A"),
        in_category("B1", 5.0, "B"),
    ];
    let result = equalize_weights(&criteria, CATEGORY);
    assert_eq!(result[0].category_weight, Some(50.0));
    assert_eq!(result[1].category_weight, Some(50.0));
    assert_eq!(result[2].category_weight, Some(50.0));
    assert!(validate_weights(&result, CATEGORY).valid);
}

// "distributes weights equally across criteria (criterion mode)"
#[test]
fn equalize_across_criteria() {
    let criteria = [
        in_category("A", 5.0, "X"),
        in_category("B", 5.0, "X"),
        in_category("C", 5.0, "Y"),
        in_category("D", 5.0, "Y"),
    ];
    let result = equalize_weights(&criteria, CRITERION);
    for criterion in &result {
        assert_eq!(criterion.criterion_weight, Some(25.0));
    }
    assert!(validate_weights(&result, CRITERION).valid);
}

// "handles 3 categories with remainder"
#[test]
fn equalize_three_categories_with_remainder() {
    let criteria = [
        in_category("A", 5.0, "A"),
        in_category("B", 5.0, "B"),
        in_category("C", 5.0, "C"),
    ];
    let result = equalize_weights(&criteria, CATEGORY);
    assert!(validate_weights(&result, CATEGORY).valid);
    let sum = result
        .iter()
        .enumerate()
        .filter(|(i, criterion)| *i == 0 || criterion.category != result[i - 1].category)
        .fold(0.0, |sum, (_, criterion)| {
            sum + criterion.category_weight.unwrap_or(0.0)
        });
    assert!(close_to(sum, 100.0));
}

// "returns empty array unchanged"
#[test]
fn equalize_empty() {
    assert_eq!(equalize_weights(&[], CATEGORY), []);
}

// "does not mutate input"
#[test]
fn equalize_leaves_input_alone() {
    let criteria = [in_category("A", 5.0, "A")];
    let original = criteria.clone();
    equalize_weights(&criteria, CATEGORY);
    assert_eq!(criteria, original);
}

// ── autoFillWeights ─────────────────────────────────────────────────────

// "distributes category weights proportional to points"
#[test]
fn auto_fill_category_weights_in_proportion_to_points() {
    let criteria = [
        in_category("A1", 3.0, "A"),
        in_category("A2", 3.0, "A"),
        in_category("B1", 7.0, "B"),
    ];
    let result = auto_fill_weights(&criteria, CATEGORY);
    let a_weight = result[0].category_weight.expect("A is weighted");
    let b_weight = result[2].category_weight.expect("B is weighted");
    assert!(close_to(a_weight + b_weight, 100.0));
    assert!(b_weight > a_weight);
    assert!(validate_weights(&result, CATEGORY).valid);
}

// "distributes criterion weights proportional to points"
#[test]
fn auto_fill_criterion_weights_in_proportion_to_points() {
    let criteria = [criterion("A", "", 3.0), criterion("B", "", 7.0)];
    let result = auto_fill_weights(&criteria, CRITERION);
    let a_weight = result[0].criterion_weight.expect("A is weighted");
    let b_weight = result[1].criterion_weight.expect("B is weighted");
    assert!(close_to(a_weight + b_weight, 100.0));
    assert!(b_weight > a_weight);
    assert!(validate_weights(&result, CRITERION).valid);
}

// "falls back to equal when all points are zero"
#[test]
fn auto_fill_equal_when_no_points() {
    let criteria = [in_category("A", 0.0, "A"), in_category("B", 0.0, "B")];
    let result = auto_fill_weights(&criteria, CATEGORY);
    assert_eq!(result[0].category_weight, Some(50.0));
    assert_eq!(result[1].category_weight, Some(50.0));
}

// "returns empty array unchanged"
#[test]
fn auto_fill_empty() {
    assert_eq!(auto_fill_weights(&[], CRITERION), []);
}

// "does not mutate input"
#[test]
fn auto_fill_leaves_input_alone() {
    let criteria = [criterion("A", "", 10.0)];
    let original = criteria.clone();
    auto_fill_weights(&criteria, CRITERION);
    assert_eq!(criteria, original);
}

// ── textToCriteria — checkbox format ────────────────────────────────────

// "parses a single category line with one checkbox criterion"
#[test]
fn checkbox_single_category_line() {
    let text = "CLT Statement\t☐ States sampling distribution of x̄ approaches normality";
    assert_eq!(
        text_to_criteria(text),
        [in_category(
            "States sampling distribution of x̄ approaches normality",
            0.0,
            "CLT Statement"
        )]
    );
}

// "parses multiple checkbox criteria in the same category (continuation lines)"
#[test]
fn checkbox_continuation_lines() {
    let text = [
        "CLT Statement\t☐ States sampling distribution of x̄ approaches normality",
        "☐ Mentions condition: sufficiently large n",
    ]
    .join("\n");
    let result = text_to_criteria(&text);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].category.as_deref(), Some("CLT Statement"));
    assert_eq!(
        result[0].criteria,
        "States sampling distribution of x̄ approaches normality"
    );
    assert_eq!(result[1].category.as_deref(), Some("CLT Statement"));
    assert_eq!(
        result[1].criteria,
        "Mentions condition: sufficiently large n"
    );
    assert_eq!(result[1].points, 0.0);
    assert_eq!(result[1].description, "");
}

// "parses multiple categories with their criteria"
#[test]
fn checkbox_multiple_categories() {
    let text = [
        "CLT Statement\t☐ States sampling distribution of x̄ approaches normality",
        "☐ Mentions condition: sufficiently large n",
        "Standard Error\t☐ Provides formula SE = σ/√n",
        "☐ Explains SE decreases as n increases",
        "Margin of Error Connection\t☐ Provides MOE formula: MOE = z* × SE",
    ]
    .join("\n");
    let result = text_to_criteria(&text);
    assert_eq!(result.len(), 5);
    assert_eq!(result[0].category.as_deref(), Some("CLT Statement"));
    assert_eq!(result[1].category.as_deref(), Some("CLT Statement"));
    assert_eq!(result[2].category.as_deref(), Some("Standard Error"));
    assert_eq!(result[2].criteria, "Provides formula SE = σ/√n");
    assert_eq!(result[3].category.as_deref(), Some("Standard Error"));
    assert_eq!(
        result[4].category.as_deref(),
        Some("Margin of Error Connection")
    );
    assert_eq!(result[4].criteria, "Provides MOE formula: MOE = z* × SE");
}

// "all parsed criteria have points: 0 and description: ''"
#[test]
fn checkbox_criteria_have_no_points_or_description() {
    let result = text_to_criteria("Category A\t☐ Criterion one\n☐ Criterion two");
    assert!(!result.is_empty());
    for criterion in &result {
        assert_eq!(criterion.points, 0.0);
        assert_eq!(criterion.description, "");
    }
}

// "skips blank lines"
#[test]
fn checkbox_skips_blank_lines() {
    let result = text_to_criteria("Category A\t☐ First\n\n☐ Second\n");
    assert_eq!(result.len(), 2);
}

// "handles criterion text that itself contains colons"
#[test]
fn checkbox_criterion_with_symbols() {
    let result = text_to_criteria("Standard Error\t☐ Provides formula SE = σ/√n");
    assert_eq!(result[0].criteria, "Provides formula SE = σ/√n");
}

// "does not fall through to standard parser when checkbox format detected"
#[test]
fn checkbox_format_excludes_points_lines() {
    let text = "Category\t☐ Some criterion\nWriting Quality (10pts): Clear grammar";
    let result = text_to_criteria(text);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].criteria, "Some criterion");
}

// "returns empty array for empty string (checkbox path not triggered)"
#[test]
fn checkbox_empty_string() {
    assert_eq!(text_to_criteria(""), []);
}

// "strips extra whitespace from category and criteria names"
#[test]
fn checkbox_strips_whitespace() {
    let result = text_to_criteria("  My Category  \t☐  Criterion with spaces  ");
    assert_eq!(result[0].category.as_deref(), Some("My Category"));
    assert_eq!(result[0].criteria, "Criterion with spaces");
}

// ── textToCriteria — indented-category format ───────────────────────────

// "parses a single category with one indented criterion"
#[test]
fn indented_single_category() {
    let result = text_to_criteria("Statistical Decision\t\n Compare the p-value to α");
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].category.as_deref(), Some("Statistical Decision"));
    assert_eq!(result[0].criteria, "Compare the p-value to α");
    assert_eq!(result[0].points, 0.0);
    assert_eq!(result[0].description, "");
}

// "parses multiple criteria under one category"
#[test]
fn indented_multiple_criteria() {
    let text = "Statistical Decision\t\n Compare the p-value to α and state whether you reject or fail to reject H₀.\n State whether the result is statistically significant.";
    let result = text_to_criteria(text);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].category.as_deref(), Some("Statistical Decision"));
    assert_eq!(
        result[0].criteria,
        "Compare the p-value to α and state whether you reject or fail to reject H₀."
    );
    assert_eq!(result[1].category.as_deref(), Some("Statistical Decision"));
    assert_eq!(
        result[1].criteria,
        "State whether the result is statistically significant."
    );
}

// "parses multiple categories with their indented criteria"
#[test]
fn indented_multiple_categories() {
    let text = [
        "Statistical Decision\t",
        " Compare the p-value to α and state whether you reject or fail to reject H₀.",
        " State whether the result is statistically significant.",
        "Conclusion in Context\t",
        " Explain what the test decision means for the specific claim in this real-world situation.",
        "Interpretation of Evidence\t",
        " Describe what the evidence tells us and what the researcher should take away from the result.",
    ]
    .join("\n");
    let result = text_to_criteria(&text);
    assert_eq!(result.len(), 4);
    assert_eq!(result[0].category.as_deref(), Some("Statistical Decision"));
    assert_eq!(result[1].category.as_deref(), Some("Statistical Decision"));
    assert_eq!(result[2].category.as_deref(), Some("Conclusion in Context"));
    assert_eq!(
        result[3].category.as_deref(),
        Some("Interpretation of Evidence")
    );
}

// "all parsed criteria have points: 0 and description: ''"
#[test]
fn indented_criteria_have_no_points_or_description() {
    let result = text_to_criteria("Category\t\n Criterion one\n Criterion two");
    assert!(!result.is_empty());
    for criterion in &result {
        assert_eq!(criterion.points, 0.0);
        assert_eq!(criterion.description, "");
    }
}

// "skips blank lines"
#[test]
fn indented_skips_blank_lines() {
    let result = text_to_criteria("Category\t\n\n Criterion one\n\n Criterion two\n");
    assert_eq!(result.len(), 2);
}

// "handles criteria containing colons, equals signs, and special chars"
#[test]
fn indented_criterion_with_symbols() {
    let result = text_to_criteria("Standard Error\t\n Provides formula SE = σ/√n");
    assert_eq!(result[0].criteria, "Provides formula SE = σ/√n");
}

// "does not trigger when text has no trailing-tab category lines"
#[test]
fn indented_format_needs_a_trailing_tab() {
    let result = text_to_criteria("Writing Quality (10pts): Clear grammar");
    assert_eq!(result[0].criteria, "Writing Quality");
    assert_eq!(result[0].points, 10.0);
}

// ── allocation row detection ────────────────────────────────────────────

fn only_row_type(text: &str) -> Option<RowType> {
    let result = text_to_criteria(text);
    assert_eq!(result.len(), 1);
    result[0].row_type
}

// "detects 'Full (2pts)' as allocation row"
#[test]
fn allocation_full() {
    assert_eq!(only_row_type("Full (2pts)"), Some(RowType::Allocation));
}

// "detects 'Partial (1pts): Partial description' as allocation row"
#[test]
fn allocation_partial_with_description() {
    assert_eq!(
        only_row_type("Partial (1pts): Partial description"),
        Some(RowType::Allocation)
    );
}

// "detects 'Missing (0pts)' as allocation row"
#[test]
fn allocation_missing() {
    assert_eq!(only_row_type("Missing (0pts)"), Some(RowType::Allocation));
}

// "detects 'Minimal (1pts)' as allocation row"
#[test]
fn allocation_minimal() {
    assert_eq!(only_row_type("Minimal (1pts)"), Some(RowType::Allocation));
}

// "does NOT set rowType for 'States the CLT (0pts)'"
#[test]
fn allocation_not_an_ordinary_criterion() {
    assert_eq!(only_row_type("States the CLT (0pts)"), None);
}

// "does NOT set rowType for 'Full Credit (2pts)' (extra words after keyword)"
#[test]
fn allocation_not_with_extra_words() {
    assert_eq!(only_row_type("Full Credit (2pts)"), None);
}

// "detects allocation rows in checkbox format with 'Full (2):' in criterion text"
#[test]
fn allocation_in_checkbox_format() {
    let text = "Category A\t☐ Full (2): Complete solution with all steps shown";
    let result = text_to_criteria(text);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].row_type, Some(RowType::Allocation));
    assert_eq!(
        result[0].criteria,
        "Full (2): Complete solution with all steps shown"
    );
}

// ── cases outside any `describe` in the original ────────────────────────

// "distributes 25% across 4 categories (category mode)"
#[test]
fn equalize_four_categories() {
    let criteria = [
        in_category("A1", 5.0, "A"),
        in_category("A2", 5.0, "A"),
        in_category("B1", 5.0, "B"),
        in_category("B2", 5.0, "B"),
        in_category("C1", 5.0, "C"),
        in_category("D1", 5.0, "D"),
    ];
    let result = equalize_weights(&criteria, CATEGORY);
    let mut by_category: Vec<(&str, f64)> = Vec::new();
    for criterion in &result {
        let category = criterion.category.as_deref().expect("has a category");
        let weight = criterion.category_weight.expect("is weighted");
        match by_category.iter().find(|(seen, _)| *seen == category) {
            // Criteria in one category share its weight.
            Some((_, first)) => assert_eq!(weight, *first),
            None => by_category.push((category, weight)),
        }
    }
    assert_eq!(by_category.len(), 4);
    for (_, weight) in &by_category {
        assert_eq!(*weight, 25.0);
    }
    assert!(validate_weights(&result, CATEGORY).valid);
}

// "round-trips equalized category weights through text"
#[test]
fn equalized_category_weights_round_trip_through_text() {
    let criteria = [
        in_category("A1", 5.0, "Alpha"),
        in_category("A2", 5.0, "Alpha"),
        in_category("B1", 5.0, "Beta"),
        in_category("C1", 5.0, "Gamma"),
        in_category("D1", 5.0, "Delta"),
    ];
    let equalized = equalize_weights(&criteria, CATEGORY);
    let reparsed = text_to_criteria(&criteria_to_text(&equalized));
    assert_eq!(reparsed.len(), equalized.len());
    for (reparsed, equalized) in reparsed.iter().zip(&equalized) {
        assert_eq!(reparsed.category_weight, equalized.category_weight);
    }
}

// "autoFillWeights category mode gives per-CATEGORY weights, not per-criterion"
#[test]
fn auto_fill_by_category_weights_categories_not_criteria() {
    let criteria: Vec<RubricCriterion> = ["A", "B", "C", "D"]
        .iter()
        .flat_map(|letter| {
            [1, 2].map(|n| in_category(&format!("{letter}{n}"), 5.0, &format!("Cat{letter}")))
        })
        .collect();
    assert_eq!(criteria.len(), 8);
    let result = auto_fill_weights(&criteria, CATEGORY);
    for criterion in &result {
        assert_eq!(criterion.category_weight, Some(25.0));
        assert_eq!(criterion.criterion_weight, None);
    }
    assert!(validate_weights(&result, CATEGORY).valid);
}

// "autoFillWeights category mode with unequal points distributes per-CATEGORY proportional weights"
#[test]
fn auto_fill_by_category_with_unequal_points() {
    let criteria = [
        in_category("A1", 10.0, "CatA"),
        in_category("A2", 10.0, "CatA"),
        in_category("A3", 10.0, "CatA"),
        in_category("B1", 10.0, "CatB"),
        in_category("B2", 10.0, "CatB"),
        in_category("C1", 5.0, "CatC"),
        in_category("C2", 5.0, "CatC"),
        in_category("D1", 5.0, "CatD"),
    ];
    let result = auto_fill_weights(&criteria, CATEGORY);
    let mut by_category: Vec<(&str, f64)> = Vec::new();
    for criterion in &result {
        let category = criterion.category.as_deref().expect("has a category");
        let weight = criterion.category_weight.expect("is weighted");
        match by_category.iter().find(|(seen, _)| *seen == category) {
            Some((_, first)) => assert_eq!(weight, *first),
            None => by_category.push((category, weight)),
        }
    }
    assert_eq!(by_category.len(), 4);
    let sum = by_category
        .iter()
        .fold(0.0, |sum, (_, weight)| sum + weight);
    assert!((sum - 100.0).abs() <= 0.5);
    let weight_of = |category: &str| {
        by_category
            .iter()
            .find(|(name, _)| *name == category)
            .map(|(_, weight)| *weight)
            .expect("category is weighted")
    };
    assert!(weight_of("CatA") > weight_of("CatB"));
    assert!(weight_of("CatB") > weight_of("CatC"));
    assert!(weight_of("CatC") > weight_of("CatD"));
}

// ── textToCriteria — model response marker truncation ───────────────────

// "truncates at the marker before parsing (generic pts format)"
#[test]
fn marker_truncates_points_format() {
    let text = [
        "Left Skew (5pts): Identifies the distribution shape",
        "Center (5pts): Reports an appropriate measure of center",
        "",
        "--- Model Response ---",
        "Ideal: \"The distribution is left-skewed (negatively skewed).\"",
        "Report the median and explain your choice.",
    ]
    .join("\n");
    let result = text_to_criteria(&text);
    assert_eq!(
        result,
        [
            criterion("Left Skew", "Identifies the distribution shape", 5.0),
            criterion("Center", "Reports an appropriate measure of center", 5.0),
        ]
    );
    for criterion in &result {
        assert!(!criterion.criteria.contains("Ideal:"));
        assert!(!criterion.criteria.contains("left-skewed"));
    }
}

// "truncates at the marker before parsing (checkbox format)"
#[test]
fn marker_truncates_checkbox_format() {
    let text = [
        "Procedural: Report the mean value.\t☐ 1",
        "☐ Report the mean value",
        "Procedural: Describe the distribution.\t☐ 1",
        "--- Model Response ---",
        "Ideal: \"The distribution is left-skewed (negatively skewed).\"",
        "The center should be described by the median.",
    ]
    .join("\n");
    let result = text_to_criteria(&text);
    assert_eq!(
        result,
        [
            in_category("1", 0.0, "Procedural: Report the mean value."),
            in_category(
                "Report the mean value",
                0.0,
                "Procedural: Report the mean value."
            ),
            in_category("1", 0.0, "Procedural: Describe the distribution."),
        ]
    );
    for criterion in &result {
        assert!(!criterion.criteria.contains("Ideal:"));
    }
}

// "round-trips plain criteria text with no marker (no regression)"
#[test]
fn marker_absent_round_trips() {
    let criteria = [
        criterion("Shape", "Identifies the distribution shape", 5.0),
        criterion("Center", "Reports an appropriate measure of center", 5.0),
    ];
    assert_eq!(text_to_criteria(&criteria_to_text(&criteria)), criteria);
}

// "round-trips equalized category weights so validateWeights stays valid"
#[test]
fn equalized_weights_stay_valid_through_text() {
    let criteria = [
        criterion("Left Skew", "Identifies the shape", 5.0).category("Shape"),
        criterion("Median", "Reports the center", 5.0).category("Center"),
    ];
    let equalized = equalize_weights(&criteria, CATEGORY);
    let parsed = text_to_criteria(&criteria_to_text(&equalized));
    assert!(validate_weights(&parsed, CATEGORY).valid);
    assert_eq!(parsed[0].category.as_deref(), Some("Shape"));
    assert_eq!(parsed[1].category.as_deref(), Some("Center"));
    assert_eq!(parsed[0].category_weight, Some(50.0));
    assert_eq!(parsed[1].category_weight, Some(50.0));
}
