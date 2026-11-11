//! A scripted stand-in for an AI provider, and fixtures shared by the tests.
#![allow(dead_code)]

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use ogre_core::{Rubric, StudentWork};
use ogre_grader::{GradeEvent, GradeOptions, GradeStatus, StudentOutcome, SweepMode};
use ogre_llm::{ChatProvider, ChatRequest, LlmError, ProviderKind};

enum Scripted {
    Reply(String),
    ReplyAfter(Duration, String),
    Fail(LlmError),
}

type Hook = Box<dyn Fn(usize) + Send + Sync>;

/// Answers each request with the next scripted reply and records the prompt
/// it was sent. A request with no reply left panics, so a test fails if the
/// code under test asks for more than the test expects.
#[derive(Default)]
pub struct ScriptedProvider {
    script: Mutex<VecDeque<Scripted>>,
    prompts: Mutex<Vec<String>>,
    after_call: Option<Hook>,
}

impl ScriptedProvider {
    pub fn new() -> Self {
        Self::default()
    }

    fn push(self, step: Scripted) -> Self {
        self.script.lock().unwrap().push_back(step);
        self
    }

    pub fn reply(self, text: impl Into<String>) -> Self {
        self.push(Scripted::Reply(text.into()))
    }

    pub fn reply_after(self, delay: Duration, text: impl Into<String>) -> Self {
        self.push(Scripted::ReplyAfter(delay, text.into()))
    }

    pub fn fail(self, error: LlmError) -> Self {
        self.push(Scripted::Fail(error))
    }

    /// Runs `hook` with the request's number, counting from 1, just before
    /// each reply is handed back.
    pub fn after_call(mut self, hook: impl Fn(usize) + Send + Sync + 'static) -> Self {
        self.after_call = Some(Box::new(hook));
        self
    }

    pub fn prompts(&self) -> Vec<String> {
        self.prompts.lock().unwrap().clone()
    }

    pub fn calls(&self) -> usize {
        self.prompts.lock().unwrap().len()
    }

    pub fn unused_replies(&self) -> usize {
        self.script.lock().unwrap().len()
    }
}

#[async_trait]
impl ChatProvider for ScriptedProvider {
    async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
        let prompt = request
            .messages
            .iter()
            .map(|message| message.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let call = {
            let mut prompts = self.prompts.lock().unwrap();
            prompts.push(prompt.clone());
            prompts.len()
        };
        let step = self.script.lock().unwrap().pop_front();
        let outcome = match step {
            Some(Scripted::Reply(text)) => Ok(text),
            Some(Scripted::ReplyAfter(delay, text)) => {
                tokio::time::sleep(delay).await;
                Ok(text)
            }
            Some(Scripted::Fail(error)) => Err(error),
            None => panic!(
                "request {call} has no scripted reply; its prompt begins: {}",
                prompt.chars().take(160).collect::<String>()
            ),
        };
        if let Some(hook) = &self.after_call {
            hook(call);
        }
        outcome
    }
}

pub fn timeout_error() -> LlmError {
    LlmError::Timeout {
        provider: ProviderKind::Ollama,
        timeout: Duration::from_secs(600),
    }
}

pub fn unauthorized_error() -> LlmError {
    LlmError::Http {
        provider: ProviderKind::OpenAi,
        status: 401,
        body: "invalid api key".to_owned(),
    }
}

pub fn rubric() -> Rubric {
    serde_json::from_str(
        r#"{
            "essayPrompt": "Explain why the sample mean is roughly normal for large samples.",
            "maxScore": "10",
            "checklistItems": [
                {"category": "Understanding (6 pts)", "points": 6,
                 "items": ["States the Central Limit Theorem", "Mentions sample size"]},
                {"category": "Communication (4 pts)", "points": 4,
                 "items": ["Uses complete sentences"]}
            ]
        }"#,
    )
    .expect("fixture rubric is valid")
}

pub fn student(index: usize, name: &str, response: &str) -> StudentWork {
    StudentWork {
        index,
        name: name.to_owned(),
        response: response.to_owned(),
        prompt: None,
    }
}

/// `count` students with indices from `first`, each with a distinct answer.
pub fn students(first: usize, count: usize) -> Vec<StudentWork> {
    (first..first + count)
        .map(|index| {
            student(
                index,
                &format!("Last{index}, First{index}"),
                &format!("Answer number {index} about the theorem."),
            )
        })
        .collect()
}

/// A batch reply: one result per score, numbered from zero as models do.
/// The feedback has no requirement sections, so scores are taken as given.
pub fn grades(scores: &[f64]) -> String {
    let items: Vec<serde_json::Value> = scores
        .iter()
        .enumerate()
        .map(|(position, score)| {
            serde_json::json!({
                "studentIndex": position,
                "score": score,
                "feedback": format!("Feedback for a {score}."),
            })
        })
        .collect();
    serde_json::Value::Array(items).to_string()
}

/// Options with the end-of-run checks and heartbeats off.
pub fn plain_options(chunk_size: usize) -> GradeOptions {
    GradeOptions {
        chunk_size,
        sweep: SweepMode::None,
        heartbeat: None,
        ..GradeOptions::default()
    }
}

pub fn score_of(outcome: &StudentOutcome) -> Option<f64> {
    outcome.grade().map(|grade| grade.score)
}

/// `(student index, score)` per student, `None` for those not graded.
pub fn scores(outcomes: &[StudentOutcome]) -> Vec<(usize, Option<f64>)> {
    outcomes
        .iter()
        .map(|outcome| (outcome.student_index, score_of(outcome)))
        .collect()
}

/// One short word per event, to assert on the order of a run.
pub fn trace(events: &[GradeEvent]) -> Vec<String> {
    events
        .iter()
        .map(|event| match event {
            GradeEvent::ChunkStarted { chunk_index, .. } => format!("start {chunk_index}"),
            GradeEvent::Heartbeat { elapsed } => format!("heartbeat {}s", elapsed.as_secs()),
            GradeEvent::Student(outcome) => match &outcome.status {
                GradeStatus::Graded(grade) => {
                    format!("student {} = {}", outcome.student_index, grade.score)
                }
                GradeStatus::NotGraded(_) => {
                    format!("student {} not graded", outcome.student_index)
                }
            },
            GradeEvent::ChunkFinished {
                chunk_index,
                graded,
                not_graded,
            } => format!("finish {chunk_index} ({graded} graded, {not_graded} not)"),
            GradeEvent::SweepStarted { kind } => format!("sweep {kind:?}"),
            GradeEvent::SweepRegrade { count } => format!("regrade {count}"),
            GradeEvent::Review { adjustments } => format!("review {}", adjustments.len()),
            GradeEvent::OutlierReviewStarted { outlier_count } => {
                format!("outlier review {outlier_count}")
            }
            GradeEvent::OutliersAdjusted { students } => {
                format!("outliers adjusted {}", students.len())
            }
            GradeEvent::Warning(_) => "warning".to_owned(),
            GradeEvent::Done(summary) => format!("done ({} graded)", summary.graded),
        })
        .collect()
}

/// Runs a batch against the fixture rubric and collects its events.
pub async fn run_batch(
    provider: &ScriptedProvider,
    students: Vec<StudentWork>,
    options: &GradeOptions,
    cancel: &ogre_grader::CancelFlag,
) -> (ogre_grader::BatchOutcome, Vec<GradeEvent>) {
    let mut events = Vec::new();
    let outcome = ogre_grader::grade_batch(
        provider,
        &rubric(),
        students,
        options,
        cancel,
        &mut |event| events.push(event),
    )
    .await
    .expect("the batch runs");
    (outcome, events)
}
