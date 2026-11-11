//! Port of `grading-server/test/grading-weights.test.js`.
//!
//! All three originals fail against the current grading.js: they expect the
//! category list to read "N points total", but the batch prompt now scores
//! every category out of 10 and applies weights when parsing. Each port keeps
//! the inputs and the assertions that still hold, and pins the current text
//! where the original's expectation is stale.

use super::*;

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

fn base_rubric(weight_mode: Option<WeightMode>) -> Rubric {
    let mut rubric = rubric(
        r#"{
            "essayPrompt": "Explain the concept.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Understanding (5 pts)", "points": 5, "categoryWeight": 40, "items": ["Shows comprehension"]}
            ]
        }"#,
    );
    rubric.weight_mode = weight_mode;
    rubric
}

const CATEGORY_LINE: &str = "- Understanding (5 pts): 10 points\n";

// "regression — no weightMode → byte-identical output, original points, no weight% in scoring section"
#[test]
fn no_weight_mode_is_deterministic_and_hides_weight_fields() {
    let prompt1 = batch_prompt(&base_rubric(None), &weight_students(), &weight_anchors());
    let prompt2 = batch_prompt(&base_rubric(None), &weight_students(), &weight_anchors());
    assert_eq!(prompt1, prompt2);
    // Stale upstream: expects "5 points total".
    assert!(!prompt1.contains("5 points total"));
    assert!(prompt1.contains(CATEGORY_LINE));
    assert!(!prompt1.contains("categoryWeight"));
    assert!(!prompt1.contains("weightMode"));
}

// "category mode — applies effective points (5 pts × 40% = 2 pts)"
#[test]
fn category_mode_hides_weight_fields() {
    let prompt = batch_prompt(
        &base_rubric(Some(WeightMode::Category)),
        &weight_students(),
        &weight_anchors(),
    );
    // Stale upstream: expects "2 points total".
    assert!(!prompt.contains("2 points total"));
    assert!(prompt.contains(CATEGORY_LINE));
    assert!(!prompt.contains("5 points total"));
    assert!(!prompt.contains("categoryWeight"));
    assert!(!prompt.contains("weightMode"));
}

// "off mode — explicit weightMode:off leaves points unchanged"
#[test]
fn off_mode_leaves_points_unchanged() {
    let prompt = batch_prompt(
        &base_rubric(Some(WeightMode::Off)),
        &weight_students(),
        &weight_anchors(),
    );
    // Stale upstream: expects "5 points total".
    assert!(!prompt.contains("5 points total"));
    assert!(prompt.contains(CATEGORY_LINE));
    assert!(!prompt.contains("2 points total"));
}
