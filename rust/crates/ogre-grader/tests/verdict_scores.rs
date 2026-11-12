//! Scores worked out from the feedback's verdicts instead of taken from the AI.

mod common;

use common::{ScriptedProvider, plain_options, run_batch, scores, students};
use ogre_grader::{CancelFlag, GradeOptions, ScoreSource};

fn section(heading: &str, evaluation: &str) -> String {
    format!(
        "<p><strong>{heading}</strong></p><blockquote>You said: \"…\"</blockquote><p>{evaluation}</p><p><em>To improve: N/A</em></p>"
    )
}

/// Feedback for the test rubric's three requirements.
fn feedback(evaluations: [&str; 3]) -> String {
    let headings = [
        "States the Central Limit Theorem",
        "Mentions sample size",
        "Uses complete sentences",
    ];
    let sections: String = headings
        .iter()
        .zip(evaluations)
        .map(|(heading, evaluation)| section(heading, evaluation))
        .collect();
    format!("<p>Hi there,</p>{sections}")
}

const CORRECT: &str = "Correct. Clearly put.";
const INCORRECT: &str = "Incorrect. The sample size is left out.";

/// Four students: all correct with a low AI score, one requirement missed
/// with a high AI score, feedback with no sections, and readable feedback
/// with no AI score at all.
fn reply() -> String {
    serde_json::json!([
        { "studentIndex": 0, "score": 8, "feedback": feedback([CORRECT; 3]) },
        { "studentIndex": 1, "score": 9, "feedback": feedback([CORRECT, INCORRECT, CORRECT]) },
        { "studentIndex": 2, "score": 6, "feedback": "A fair attempt." },
        { "studentIndex": 3, "feedback": feedback([INCORRECT, INCORRECT, CORRECT]) },
    ])
    .to_string()
}

fn from_verdicts() -> GradeOptions {
    GradeOptions {
        score_source: ScoreSource::Verdicts,
        ..plain_options(30)
    }
}

#[tokio::test]
async fn the_ai_score_is_used_unless_asked_otherwise() {
    let provider = ScriptedProvider::new().reply(reply());
    let (outcome, _) = run_batch(
        &provider,
        students(0, 4),
        &plain_options(30),
        &CancelFlag::new(),
    )
    .await;
    assert_eq!(
        scores(&outcome.students),
        [
            // Every verdict Correct: raised to full, as before.
            (0, Some(10.0)),
            (1, Some(9.0)),
            (2, Some(6.0)),
            // No score from the AI is not a grade.
            (3, None),
        ]
    );
}

#[tokio::test]
async fn scores_follow_the_verdicts_when_asked() {
    let provider = ScriptedProvider::new().reply(reply());
    let (outcome, _) = run_batch(
        &provider,
        students(0, 4),
        &from_verdicts(),
        &CancelFlag::new(),
    )
    .await;
    assert_eq!(
        scores(&outcome.students),
        [
            (0, Some(10.0)),
            // One of two requirements in one of two equal categories.
            (1, Some(7.5)),
            // Nothing to read verdicts from: the AI's score stands.
            (2, Some(6.0)),
            // The verdicts are a grade even where the AI gave no number.
            (3, Some(5.0)),
        ]
    );
    let kept: Vec<_> = outcome
        .warnings
        .iter()
        .filter(|warning| warning.contains("the AI's own score was kept"))
        .collect();
    assert_eq!(kept.len(), 1, "{:?}", outcome.warnings);
    assert!(kept[0].contains("1 student"), "{}", kept[0]);
}

#[tokio::test]
async fn the_consistency_check_is_not_run_on_scores_from_verdicts() {
    let six: Vec<_> = (0..6)
        .map(|index| {
            serde_json::json!({
                "studentIndex": index,
                "score": 7,
                "feedback": feedback([CORRECT, INCORRECT, CORRECT]),
            })
        })
        .collect();
    let provider = ScriptedProvider::new().reply(serde_json::Value::Array(six).to_string());
    let options = GradeOptions {
        score_source: ScoreSource::Verdicts,
        heartbeat: None,
        ..GradeOptions::default()
    };

    let (outcome, _) = run_batch(&provider, students(0, 6), &options, &CancelFlag::new()).await;

    assert_eq!(provider.calls(), 1, "only the grading request was sent");
    assert!(outcome.sweep.adjustments.is_empty());
    assert!(
        scores(&outcome.students)
            .iter()
            .all(|(_, score)| *score == Some(7.5))
    );
}
