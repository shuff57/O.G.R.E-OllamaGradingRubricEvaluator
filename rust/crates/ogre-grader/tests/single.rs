//! Single-student grading and anchor example generation.

mod common;

use common::{ScriptedProvider, rubric, timeout_error};
use ogre_core::{Rubric, SingleGrade};
use ogre_grader::{GraderError, calibration_instructions, generate_anchor_examples, grade_single};

#[tokio::test]
async fn one_student_is_graded_from_a_json_reply() {
    let provider = ScriptedProvider::new().reply(
        "<think>Looks solid.</think>```json\n{\"score\": 8, \"feedback\": \"Clear, but say why n matters.\"}\n```",
    );
    let grade = grade_single(
        &provider,
        &rubric(),
        "Student: Avery, Sam\n\nMeans of big samples look normal.",
        "Be brief.",
    )
    .await;

    assert_eq!(
        grade,
        Ok(SingleGrade {
            score: 8.0,
            feedback: "Clear, but say why n matters.".to_owned(),
        })
    );
    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 1);
    assert!(
        prompts[0].starts_with("You are an expert grading assistant. Grade this student's work")
    );
    assert!(
        prompts[0]
            .contains("STUDENT WORK:\nStudent: Avery, Sam\n\nMeans of big samples look normal.\n")
    );
    assert!(prompts[0].contains("ADDITIONAL INSTRUCTIONS:\nBe brief.\n"));
}

#[tokio::test]
async fn a_single_score_is_converted_to_the_rubrics_scale() {
    let twenty: Rubric = serde_json::from_str(r#"{"maxScore": 20}"#).unwrap();
    let provider = ScriptedProvider::new().reply(r#"{"score": 7, "feedback": "Fine."}"#);
    let grade = grade_single(&provider, &twenty, "An answer.", "")
        .await
        .expect("graded");
    assert_eq!(grade.score, 14.0);
    assert!(!provider.prompts()[0].contains("ADDITIONAL INSTRUCTIONS"));
}

#[tokio::test]
async fn an_unreadable_single_reply_is_an_error_not_a_zero() {
    let provider = ScriptedProvider::new().reply("I would give this\na solid B.");
    let grade = grade_single(&provider, &rubric(), "An answer.", "").await;
    assert_eq!(
        grade,
        Err(GraderError::UnreadableReply {
            reply: "I would give this a solid B.".to_owned()
        })
    );
}

#[tokio::test]
async fn a_real_zero_is_a_grade() {
    let provider = ScriptedProvider::new()
        .reply(r#"{"score": 0, "feedback": "This does not address the question."}"#);
    let grade = grade_single(&provider, &rubric(), "asdf", "").await;
    assert_eq!(grade.map(|g| g.score), Ok(0.0));
}

#[tokio::test]
async fn single_grading_reports_provider_and_rubric_errors() {
    let provider = ScriptedProvider::new().fail(timeout_error());
    let failed = grade_single(&provider, &rubric(), "An answer.", "").await;
    assert_eq!(failed, Err(GraderError::Provider(timeout_error())));

    let uncategorized: Rubric =
        serde_json::from_str(r#"{"checklistItems": [{"items": ["Shows the work"]}]}"#).unwrap();
    let unusable = grade_single(&provider, &uncategorized, "An answer.", "").await;
    assert!(
        matches!(unusable, Err(GraderError::Rubric(_))),
        "{unusable:?}"
    );
    assert_eq!(provider.calls(), 1);
}

#[tokio::test]
async fn anchor_examples_are_generated_and_turned_into_instructions() {
    let provider = ScriptedProvider::new().reply(
        "EXCELLENT (10/10):\nThe CLT says sample means approach a normal shape as n grows.\n\nADEQUATE (8/10):\nBig samples make the mean normal.\n\nBELOW AVERAGE (7/10):\nIt gets normal.\n\nMINIMAL (5/10):\nBecause of math.",
    );
    let examples = generate_anchor_examples(&provider, &rubric(), Some(20.0))
        .await
        .expect("generated");

    let summary: Vec<(&str, f64, &str)> = examples
        .iter()
        .map(|e| (e.label.as_str(), e.score, e.response.as_str()))
        .collect();
    assert_eq!(
        summary,
        [
            (
                "Excellent",
                10.0,
                "The CLT says sample means approach a normal shape as n grows."
            ),
            ("Adequate", 8.0, "Big samples make the mean normal."),
            ("Below Average", 7.0, "It gets normal."),
            ("Minimal", 5.0, "Because of math."),
        ]
    );
    assert!(examples.iter().all(|e| e.max_score == 10.0));

    let prompt = &provider.prompts()[0];
    assert!(prompt.contains("LENIENT GRADING MODE (30% more lenient than standard)"));
    assert!(prompt.ends_with("MINIMAL (5/10):\n[write example]"));

    let instructions = calibration_instructions(&examples).expect("there are examples");
    assert!(instructions.starts_with("SCORING CALIBRATION:\nExcellent: The CLT says"));
    assert!(instructions.ends_with("\n\nMinimal: Because of math."));
}

#[tokio::test]
async fn anchor_generation_reports_a_provider_error() {
    let provider = ScriptedProvider::new().fail(timeout_error());
    let failed = generate_anchor_examples(&provider, &rubric(), None).await;
    assert_eq!(failed, Err(GraderError::Provider(timeout_error())));
}
