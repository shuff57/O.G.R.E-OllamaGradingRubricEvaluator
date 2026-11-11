//! The grading server's end-to-end test (`test/e2e-ollama.test.js`), with a
//! scripted provider in place of a live model. The fixture is the server's
//! own demo class: thirty answers to a statistics question.
//!
//! The original's first case, `GET /health`, has no counterpart here.

mod common;

use std::collections::HashSet;

use common::{ScriptedProvider, grades, plain_options, trace};
use ogre_core::{Rubric, StudentWork};
use ogre_grader::{
    CancelFlag, GradeEvent, GradeOptions, GradeStatus, SweepKind, grade_batch, grade_single,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct DemoClass {
    rubric: Rubric,
    students: Vec<StudentWork>,
}

fn demo_class() -> DemoClass {
    serde_json::from_str(include_str!("fixtures/demo-clt-data.json")).expect("fixture is valid")
}

/// Thirty scores from 10 down to 3, in half points and back up.
fn thirty_scores() -> Vec<f64> {
    (0..30).map(|i| 10.0 - f64::from(i % 15) * 0.5).collect()
}

// 'POST /api/chat grades a single student in grader mode'
//
// The original sends the student's answer as `message`, which the server
// uses as the teacher's instructions, and sends no `studentWork`. The answer
// is passed as the work here.
#[tokio::test]
async fn a_single_demo_student_is_graded() {
    let class = demo_class();
    let provider = ScriptedProvider::new()
        .reply(r#"{"score": 9, "feedback": "<p>Hi Marcus,</p><p>Thorough and accurate.</p>"}"#);
    let grade = grade_single(&provider, &class.rubric, &class.students[0].response, "")
        .await
        .expect("graded");

    assert!((0.0..=class.rubric.max_score_value()).contains(&grade.score));
    assert_eq!(grade.score, 9.0);
    assert!(!grade.feedback.is_empty());
    assert!(provider.prompts()[0].contains(&class.students[0].response));
}

// 'POST /api/grade grades all 30 demo students via SSE stream'
// (strategy serial, chunkSize 30, sweep none)
#[tokio::test]
async fn all_thirty_demo_students_are_graded_in_one_chunk() {
    let class = demo_class();
    let max_score = class.rubric.max_score_value();
    let provider = ScriptedProvider::new().reply(grades(&thirty_scores()));
    let mut events = Vec::new();
    let outcome = grade_batch(
        &provider,
        &class.rubric,
        class.students.clone(),
        &plain_options(30),
        &CancelFlag::new(),
        &mut |event| events.push(event),
    )
    .await
    .expect("the batch runs");

    // "Must receive a 'done' event" with "metadata.totalStudents === 30".
    let Some(GradeEvent::Done(summary)) = events.last() else {
        panic!("the last event is Done");
    };
    assert_eq!(summary.total_students, 30);
    assert_eq!(summary.chunks, 1);

    // "All 30 student indices must be present" in the per-chunk results.
    let reported: HashSet<usize> = events
        .iter()
        .filter_map(|event| match event {
            GradeEvent::Student(outcome) => Some(outcome.student_index),
            _ => None,
        })
        .collect();
    assert!(class.students.iter().all(|s| reported.contains(&s.index)));
    assert_eq!(reported.len(), 30);

    // "Every result must have a valid score and non-empty feedback."
    for student in &outcome.students {
        let GradeStatus::Graded(grade) = &student.status else {
            panic!("{} was not graded", student.name);
        };
        assert!((0.0..=max_score).contains(&grade.score), "{}", student.name);
        assert!(!grade.feedback.is_empty(), "{}", student.name);
    }

    // "No 'error' events should be present."
    assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);
    assert_eq!(provider.calls(), 1);
}

/// What the desktop app sends: no chunk size, strategy or sweep, so thirty
/// students go out as one chunk and the pairwise sweep checks each of the
/// four score bands.
#[tokio::test]
async fn the_desktop_defaults_grade_one_chunk_then_sweep_four_bands() {
    let class = demo_class();
    let provider = ScriptedProvider::new()
        .reply(grades(&thirty_scores()))
        .reply("[]")
        .reply("[]")
        .reply("[]")
        .reply("[]");
    let options = GradeOptions {
        heartbeat: None,
        ..GradeOptions::default()
    };
    let mut events = Vec::new();
    let outcome = grade_batch(
        &provider,
        &class.rubric,
        class.students,
        &options,
        &CancelFlag::new(),
        &mut |event| events.push(event),
    )
    .await
    .expect("the batch runs");

    assert_eq!(outcome.chunks, 1);
    assert_eq!(outcome.results().len(), 30);
    assert_eq!(outcome.sweep.kind, Some(SweepKind::Pairwise));
    assert!(outcome.sweep.adjustments.is_empty());
    assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);

    let trace = trace(&events);
    assert_eq!(trace.len(), 34);
    assert_eq!(trace[0], "start 0");
    assert_eq!(
        trace[31..],
        [
            "finish 0 (30 graded, 0 not)",
            "sweep Pairwise",
            "done (30 graded)"
        ]
    );
    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 5);
    for (prompt, band) in prompts[1..]
        .iter()
        .zip(["High", "Upper-Mid", "Lower-Mid", "Low"])
    {
        assert!(
            prompt.starts_with(&format!("PAIRWISE CONSISTENCY CHECK — {band} Score Band")),
            "{band}"
        );
    }
}
