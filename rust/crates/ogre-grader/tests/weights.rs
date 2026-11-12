//! Category weights the teacher writes into the rubric, from the text to the
//! score.

mod common;

use common::{ScriptedProvider, plain_options, students};
use ogre_core::{Rubric, editable_rubric_text, with_category_weight, with_equal_category_weights};
use ogre_grader::{CancelFlag, GradeOptions, grade_batch, prepare_edited_rubric, prepare_rubric};

/// A page whose categories name their points, as MyOpenMath's do.
fn scraped() -> Rubric {
    serde_json::from_value(serde_json::json!({
        "essayPrompt": "Is the number of seeds that sprout binomial?",
        "maxScore": 14,
        "rubricItems": [],
        "checklistItems": [
            {"category": "Check the Conditions(4 pts)", "items": ["Say how many trials there are."]},
            {"category": "Interpret(4 pts)", "items": ["Say what the probability means."]}
        ]
    }))
    .unwrap()
}

/// Full marks for the conditions, nothing for the interpretation, and an
/// overall score of 9 of 10 that does not follow from the two.
fn reply() -> String {
    serde_json::json!([{
        "studentIndex": 0,
        "criterion_scores": { "Check the Conditions": 10, "Interpret": 0 },
        "score": 9,
        "feedback": "<p>Hi,</p><p>Incorrect: the meaning is missing.</p>",
    }])
    .to_string()
}

async fn score(rubric: &Rubric, weights_by_name: bool) -> Option<f64> {
    let provider = ScriptedProvider::new().reply(reply());
    let options = GradeOptions {
        weights_by_name,
        ..plain_options(30)
    };
    let outcome = grade_batch(
        &provider,
        rubric,
        students(0, 1),
        &options,
        &CancelFlag::new(),
        &mut |_| {},
    )
    .await
    .unwrap();
    common::score_of(&outcome.students[0])
}

#[tokio::test]
async fn the_page_rubric_as_read_names_no_weights() {
    let provider = ScriptedProvider::new();
    let prepared = prepare_rubric(&provider, &scraped(), 50).await;
    assert!(!prepared.weights_given);
    // Weights are filled in all the same, as the Electron app does, and as
    // there they take no part: the AI's own 9 of 10, on 14 points.
    assert!(prepared.text.contains("[50%]"));
    assert_eq!(score(&prepared.rubric, false).await, Some(12.5));
}

#[tokio::test]
async fn weights_the_teacher_writes_decide_the_score() {
    let provider = ScriptedProvider::new();
    let text = with_equal_category_weights(&editable_rubric_text(&scraped()));
    let text = with_category_weight(&text, "Check the Conditions(4 pts)", 30.0);
    let text = with_category_weight(&text, "Interpret(4 pts)", 70.0);

    let prepared = prepare_edited_rubric(&provider, &scraped(), &text, 50).await;
    assert!(prepared.weights_given);
    assert_eq!(provider.calls(), 0);
    // 30% of 14 points, to the nearest half.
    assert_eq!(
        score(&prepared.rubric, prepared.weights_given).await,
        Some(4.0)
    );
}

#[tokio::test]
async fn weights_that_do_not_cover_the_whole_grade_are_not_used() {
    let provider = ScriptedProvider::new();
    // Only one of the two categories is ever scored against a weight here,
    // which would put the student out of 30% of the points.
    let text = "## Check the Conditions(4 pts) [30%]\nSay how many trials there are.\n## Meaning [70%]\nSay what the probability means.";
    let prepared = prepare_edited_rubric(&provider, &scraped(), text, 50).await;
    assert_eq!(score(&prepared.rubric, true).await, Some(12.5));
}
