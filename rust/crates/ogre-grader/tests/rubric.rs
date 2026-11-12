//! Preparing a scraped rubric for grading, against a scripted provider.

mod common;

use common::{ScriptedProvider, timeout_error};
use ogre_core::{Rubric, WeightMode, editable_rubric_text, grading_text};
use ogre_grader::{prepare_edited_rubric, prepare_rubric, rewrites_rubric};

fn scraped() -> Rubric {
    serde_json::from_value(serde_json::json!({
        "essayPrompt": "Is the number of seeds that sprout binomial?",
        "maxScore": 14,
        "modelText": "There are 20 seeds, each sprouts or not.",
        "rubricItems": [],
        "checklistItems": [
            {"category": "Check the Conditions(4 pts)", "items": [
                "Say there is a fixed number of trials, and how many.",
                "Say each trial has two outcomes, success or failure."
            ]},
            {"category": "Interpret(4 pts)", "items": [
                "Say what the probability means for this situation, in a sentence."
            ]}
        ]
    }))
    .unwrap()
}

fn weights(rubric: &Rubric) -> Vec<(String, f64)> {
    rubric
        .category_weights
        .as_ref()
        .map(|weights| weights.iter().map(|(k, v)| (k.to_owned(), *v)).collect())
        .unwrap_or_default()
}

#[tokio::test]
async fn at_the_neutral_setting_the_ai_is_not_asked() {
    let provider = ScriptedProvider::new();
    let prepared = prepare_rubric(&provider, &scraped(), 50).await;

    assert_eq!(provider.calls(), 0);
    assert!(!rewrites_rubric(50));
    assert_eq!(prepared.rewrite_problem, None);
    // The desktop app's default: equal category weights, category mode.
    assert_eq!(prepared.rubric.weight_mode, Some(WeightMode::Category));
    assert_eq!(
        weights(&prepared.rubric),
        [
            ("Check the Conditions(4 pts)".to_owned(), 50.0),
            ("Interpret(4 pts)".to_owned(), 50.0)
        ]
    );
    assert_eq!(prepared.rubric.checklist_items.len(), 2);
    assert_eq!(prepared.rubric.max_score_value(), 14.0);
    assert!(
        prepared
            .text
            .contains("## Check the Conditions(4 pts) [50%]")
    );
}

#[tokio::test]
async fn a_lenient_setting_has_the_ai_reword_the_criteria_first() {
    let neutral = prepare_rubric(&ScriptedProvider::new(), &scraped(), 50).await;
    // The AI softens one requirement and keeps the structure.
    let reply = neutral.text.replace(" [50%]", "").replace(
        "Say there is a fixed number of trials, and how many.",
        "Mention that the number of trials is set.",
    );
    let provider = ScriptedProvider::new().reply(reply);

    let prepared = prepare_rubric(&provider, &scraped(), 0).await;

    assert!(rewrites_rubric(0));
    assert_eq!(provider.calls(), 1);
    let prompt = &provider.prompts()[0];
    assert!(prompt.starts_with("Rewrite the following rubric criteria to be 50% more lenient"));
    assert!(prompt.contains("Say there is a fixed number of trials, and how many."));
    assert_eq!(prepared.rewrite_problem, None);
    let items: Vec<&str> = prepared.rubric.checklist_items[0]
        .items
        .iter()
        .map(String::as_str)
        .collect();
    assert!(
        items.contains(&"Mention that the number of trials is set."),
        "{items:?}"
    );
    assert!(!items.contains(&"Say there is a fixed number of trials, and how many."));
    // Weights are filled in after the rewrite, as before.
    assert_eq!(weights(&prepared.rubric).len(), 2);
    assert_eq!(prepared.rubric.max_score_value(), 14.0);
}

#[tokio::test]
async fn a_failed_or_unusable_rewrite_falls_back_to_the_rubric_as_written() {
    let neutral = prepare_rubric(&ScriptedProvider::new(), &scraped(), 50).await;

    let failing = ScriptedProvider::new().fail(timeout_error());
    let prepared = prepare_rubric(&failing, &scraped(), 0).await;
    assert!(prepared.rewrite_problem.is_some());
    assert_eq!(prepared.rubric, neutral.rubric);

    let chatty = ScriptedProvider::new().reply("I'd be happy to help! What rubric?");
    let prepared = prepare_rubric(&chatty, &scraped(), 100).await;
    let problem = prepared
        .rewrite_problem
        .expect("the reply dropped every criterion");
    assert!(problem.contains("lost too many criteria"), "{problem}");
    assert_eq!(prepared.rubric, neutral.rubric);
}

#[tokio::test]
async fn text_the_teacher_did_not_change_prepares_the_same_rubric() {
    let text = editable_rubric_text(&scraped());
    let edited = prepare_edited_rubric(&ScriptedProvider::new(), &scraped(), &text, 50).await;
    let as_read = prepare_rubric(&ScriptedProvider::new(), &scraped(), 50).await;
    assert_eq!(edited, as_read);
}

#[tokio::test]
async fn the_teachers_edits_are_what_is_graded() {
    let text = editable_rubric_text(&scraped())
        .replace(
            "Say each trial has two outcomes, success or failure.",
            "Name the two outcomes.",
        )
        .replace("There are 20 seeds", "There are 25 seeds");
    let provider = ScriptedProvider::new();

    let prepared = prepare_edited_rubric(&provider, &scraped(), &text, 50).await;

    assert_eq!(provider.calls(), 0);
    let items = &prepared.rubric.checklist_items[0].items;
    assert!(
        items
            .iter()
            .any(|item| item.contains("Name the two outcomes."))
    );
    assert!(!items.iter().any(|item| item.contains("success or failure")));
    assert_eq!(
        prepared.rubric.model_text.as_deref(),
        Some("There are 25 seeds, each sprouts or not.")
    );
    assert_eq!(weights(&prepared.rubric).len(), 2);
    assert_eq!(prepared.rubric.max_score_value(), 14.0);
}

#[tokio::test]
async fn leniency_rewords_the_edited_criteria_but_not_the_teachers_exemplar() {
    let text = editable_rubric_text(&scraped()).replace("20 seeds", "25 seeds");
    // The AI softens a requirement and, unasked, rewrites the exemplar too.
    // It answers in the form it was asked in, each requirement with points.
    let reply = grading_text(&text)
        .replace(
            "Say there is a fixed number of trials, and how many.",
            "Mention that the number of trials is set.",
        )
        .replace("25 seeds", "some seeds");
    let provider = ScriptedProvider::new().reply(reply);

    let prepared = prepare_edited_rubric(&provider, &scraped(), &text, 0).await;

    assert_eq!(provider.calls(), 1);
    assert!(
        provider.prompts()[0]
            .contains("Say each trial has two outcomes, success or failure. (0pts)"),
        "the AI is shown the rubric in the form it is asked to keep"
    );
    assert_eq!(prepared.rewrite_problem, None);
    assert!(
        prepared.rubric.checklist_items[0]
            .items
            .iter()
            .any(|item| item.contains("Mention that the number of trials is set."))
    );
    assert_eq!(
        prepared.rubric.model_text.as_deref(),
        Some("There are 25 seeds, each sprouts or not.")
    );
}

#[tokio::test]
async fn an_emptied_rubric_is_not_sent_for_rewording() {
    let provider = ScriptedProvider::new();
    let prepared = prepare_edited_rubric(&provider, &scraped(), "  \n", 0).await;
    assert_eq!(provider.calls(), 0);
    assert_eq!(prepared.rewrite_problem, None);
    assert!(prepared.rubric.checklist_items.is_empty());
    assert_eq!(prepared.rubric.model_text, None);
}
