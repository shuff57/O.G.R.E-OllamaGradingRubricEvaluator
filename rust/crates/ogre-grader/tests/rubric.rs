//! Preparing a scraped rubric for grading, against a scripted provider.

mod common;

use common::{ScriptedProvider, timeout_error};
use ogre_core::{Rubric, WeightMode};
use ogre_grader::{prepare_rubric, rewrites_rubric};

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
