//! Against a real Ollama on this machine. Run with
//! `cargo test -p ogre-grader -- --ignored --nocapture`.
//!
//! The model comes from `OGRE_TEST_MODEL` and defaults to `qwen3:0.6b`. A
//! model that small often answers with something unreadable; the test checks
//! that every student then ends up graded within the scale or plainly not
//! graded, never with a made-up score.

use async_trait::async_trait;
use ogre_core::{Rubric, StudentWork};
use ogre_grader::{CancelFlag, GradeEvent, GradeOptions, GradeStatus, grade_batch};
use ogre_llm::{ChatProvider, ChatRequest, HttpProvider, ProviderConfig, ProviderKind};

/// Prints each raw reply so a run shows what the model actually said.
struct Printing(HttpProvider);

#[async_trait]
impl ChatProvider for Printing {
    async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
        let reply = self.0.chat(request).await;
        match &reply {
            Ok(text) => println!(
                "--- raw reply ({} chars) ---\n{text}\n--- end ---",
                text.len()
            ),
            Err(error) => println!("--- request failed: {error} ---"),
        }
        reply
    }
}

#[tokio::test]
#[ignore = "needs Ollama on localhost:11434 with the model in OGRE_TEST_MODEL (default qwen3:0.6b)"]
async fn local_ollama_grades_three_students() {
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "qwen3:0.6b".to_owned());
    let provider = HttpProvider::new(ProviderConfig::new(ProviderKind::Ollama, model.as_str()))
        .expect("client builds");
    let models = provider.list_models().await.expect("Ollama is reachable");
    assert!(models.contains(&model), "{model} is not pulled: {models:?}");
    let provider = Printing(provider);

    let rubric: Rubric = serde_json::from_str(
        r#"{
            "essayPrompt": "Explain why the sky looks blue during the day.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Science (6 pts)", "points": 6,
                 "items": ["Says that sunlight is scattered by the air",
                           "Says that blue light is scattered more than red light"]},
                {"category": "Clarity (4 pts)", "points": 4,
                 "items": ["Writes in complete sentences"]}
            ]
        }"#,
    )
    .expect("rubric is valid");
    let max_score = rubric.max_score_value();
    let answers = [
        (
            "Rivera, Ana",
            "Sunlight hits the air and gets scattered by the molecules. Blue light has a shorter wavelength, so it is scattered much more than red light, and we see blue from every direction.",
        ),
        (
            "Chen, Leo",
            "The sky is blue because the light bounces around in the air.",
        ),
        ("Okafor, Zed", "I like pizza and my dog is named Max."),
    ];
    let students: Vec<StudentWork> = answers
        .iter()
        .enumerate()
        .map(|(index, (name, response))| StudentWork {
            index,
            name: (*name).to_owned(),
            response: (*response).to_owned(),
            prompt: None,
        })
        .collect();

    let outcome = grade_batch(
        &provider,
        &rubric,
        students,
        &GradeOptions::default(),
        &CancelFlag::new(),
        &mut |event| match event {
            GradeEvent::Student(_) | GradeEvent::Done(_) => {}
            other => println!("event: {other:?}"),
        },
    )
    .await
    .expect("the batch runs");

    println!("model: {model}, elapsed: {:.1?}", outcome.elapsed);
    assert_eq!(outcome.students.len(), 3);
    for student in &outcome.students {
        match &student.status {
            GradeStatus::Graded(grade) => {
                println!(
                    "{} -> {}/{max_score}\n    {}",
                    student.name, grade.score, grade.feedback
                );
                assert!(
                    grade.score.is_finite() && (0.0..=max_score).contains(&grade.score),
                    "{}: score {} is off the scale",
                    student.name,
                    grade.score
                );
                assert!(!grade.feedback.is_empty());
            }
            GradeStatus::NotGraded(reason) => {
                println!("{} -> NOT GRADED: {reason}", student.name);
            }
        }
    }
    for warning in &outcome.warnings {
        println!("warning: {warning}");
    }
    println!(
        "mean {} / std dev {} over {} graded",
        outcome.outliers.mean,
        outcome.outliers.std_dev,
        outcome.results().len()
    );
}
