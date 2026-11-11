//! The consistency sweep, inside a batch and on its own.

mod common;

use common::{
    ScriptedProvider, grades, plain_options, rubric, run_batch, score_of, students, timeout_error,
    trace,
};
use ogre_core::{ScoreBand, StudentResult};
use ogre_grader::{
    CancelFlag, GradeEvent, GradeOptions, SweepAdjustment, SweepKind, SweepMode, sweep_grades,
};

/// With a maximum of 10 the bands are High 9-10, Upper-Mid 8-8.5,
/// Lower-Mid 7-7.5 and Low 0-6.5. These six scores put two students in each
/// of three bands, so the pairwise sweep asks three questions.
const SCORES: [f64; 6] = [9.0, 9.5, 8.0, 8.0, 5.0, 3.0];

fn options(sweep: SweepMode) -> GradeOptions {
    GradeOptions {
        sweep,
        ..plain_options(30)
    }
}

/// A sweep reply flagging student 3 as deserving a 9.
const FLAG_STUDENT_3: &str = r#"```json
[{"studentIndex": 3, "currentScore": 8, "suggestedScore": 9,
  "suggestedFeedback": "Short.", "reason": "As complete as the answers scored 9."}]
```"#;

fn expected_adjustment(suggested: f64, feedback: &str, regraded: bool) -> SweepAdjustment {
    SweepAdjustment {
        student_index: 3,
        name: "Last3, First3".to_owned(),
        band: Some(ScoreBand::UpperMid),
        original_score: 8.0,
        original_feedback: "Feedback for a 8.".to_owned(),
        suggested_score: suggested,
        suggested_feedback: Some(feedback.to_owned()),
        reason: Some("As complete as the answers scored 9.".to_owned()),
        regraded,
    }
}

#[tokio::test]
async fn the_pairwise_sweep_suggests_a_regraded_score_without_applying_it() {
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(FLAG_STUDENT_3)
        .reply("All of these look consistent.")
        .reply(grades(&[9.5]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    // The suggestion is the re-grade's score and feedback, not the sweep's.
    let expected = expected_adjustment(9.5, "Feedback for a 9.5.", true);
    assert_eq!(outcome.sweep.kind, Some(SweepKind::Pairwise));
    assert_eq!(outcome.sweep.adjustments, std::slice::from_ref(&expected));
    // The grade itself is untouched: the teacher decides.
    assert_eq!(score_of(&outcome.students[3]), Some(8.0));

    assert_eq!(
        outcome.warnings,
        [
            "Consistency sweep (Low band): the AI's reply held no readable list of adjustments, so this check found nothing. The reply began: All of these look consistent."
        ]
    );
    let trace = trace(&events);
    assert_eq!(
        trace[trace.len() - 6..],
        [
            "finish 0 (6 graded, 0 not)",
            "sweep Pairwise",
            "warning",
            "regrade 1",
            "review 1",
            "done (6 graded)",
        ]
    );
    assert!(events.contains(&GradeEvent::Review {
        adjustments: vec![expected]
    }));
    let Some(GradeEvent::Done(summary)) = events.last() else {
        panic!("the last event is Done");
    };
    assert_eq!(summary.review_pending, 1);
    assert_eq!(summary.sweep, Some(SweepKind::Pairwise));

    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 5);
    assert!(prompts[1].contains("PAIRWISE CONSISTENCY CHECK — High Score Band"));
    assert!(prompts[1].contains("[#1] Last1, First1 | Score: 9.5/10"));
    assert!(prompts[2].contains("PAIRWISE CONSISTENCY CHECK — Upper-Mid Score Band"));
    assert!(prompts[3].contains("PAIRWISE CONSISTENCY CHECK — Low Score Band"));
    // The re-grade is the ordinary grading prompt for the flagged student.
    assert!(prompts[4].starts_with("You are an expert grading assistant. Grade ALL students"));
    assert!(prompts[4].contains("--- Student 3: Last3, First3 ---"));
    assert!(!prompts[4].contains("--- Student 2:"));
}

#[tokio::test]
async fn a_regrade_that_agrees_with_the_first_grade_suggests_nothing() {
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(FLAG_STUDENT_3)
        .reply("[]")
        .reply(grades(&[8.0]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Pairwise),
        &CancelFlag::new(),
    )
    .await;

    assert!(outcome.sweep.adjustments.is_empty());
    assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);
    assert!(!trace(&events).iter().any(|e| e.starts_with("review")));
}

#[tokio::test]
async fn a_failed_regrade_falls_back_to_the_sweeps_own_suggestion() {
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(FLAG_STUDENT_3)
        .reply("[]")
        .fail(timeout_error());
    let (outcome, _) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        outcome.sweep.adjustments,
        [expected_adjustment(9.0, "Short.", false)]
    );
    assert_eq!(outcome.warnings.len(), 1);
    assert!(outcome.warnings[0].contains("re-grading the flagged students failed"));
}

#[tokio::test]
async fn a_fallback_suggestion_off_the_scale_is_dropped() {
    let off_scale = r#"[{"studentIndex": 3, "currentScore": 8, "suggestedScore": 14}]"#;
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(off_scale)
        .reply("[]")
        .reply("Sorry, I lost track.");
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    assert!(outcome.sweep.adjustments.is_empty());
    assert_eq!(outcome.warnings.len(), 2);
    assert!(outcome.warnings[0].contains("the re-grade reply could not be read"));
    assert_eq!(
        outcome.warnings[1],
        "Consistency sweep: dropped the suggestion for Last3, First3; its score (14) is not a number from 0 to 10."
    );
    assert!(!trace(&events).iter().any(|e| e.starts_with("review")));
}

#[tokio::test]
async fn suggestions_for_students_outside_the_batch_are_ignored() {
    let stranger = r#"[{"studentIndex": 42, "currentScore": 8, "suggestedScore": 9},
                       {"studentIndex": "3", "currentScore": 8, "suggestedScore": 9},
                       {"studentIndex": 2, "currentScore": 8, "suggestedScore": 8},
                       7, null]"#;
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(stranger)
        .reply("[]");
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    // No one was flagged, so there is no re-grade request.
    assert_eq!(provider.calls(), 4);
    assert!(outcome.sweep.adjustments.is_empty());
    assert_eq!(
        outcome.warnings,
        [
            "Consistency sweep (Upper-Mid band): ignored a suggestion for student 42, who has no grade in this batch.",
            "Consistency sweep (Upper-Mid band): ignored a suggestion for student \"3\", who has no grade in this batch.",
        ]
    );
    assert!(!trace(&events).iter().any(|e| e.starts_with("regrade")));
}

#[tokio::test]
async fn a_student_flagged_twice_is_regraded_once() {
    let twice = r#"[{"studentIndex": 3, "currentScore": 8, "suggestedScore": 9,
                     "suggestedFeedback": "Short.", "reason": "As complete as the answers scored 9."},
                    {"studentIndex": 3, "currentScore": 8, "suggestedScore": 10}]"#;
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply("[]")
        .reply(twice)
        .reply("[]")
        .reply(grades(&[9.5]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        outcome.sweep.adjustments,
        [expected_adjustment(9.5, "Feedback for a 9.5.", true)]
    );
    assert!(events.contains(&GradeEvent::SweepRegrade { count: 1 }));
}

#[tokio::test]
async fn the_compact_sweep_asks_one_question() {
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply(FLAG_STUDENT_3)
        .reply(grades(&[9.0]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Compact),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(outcome.sweep.kind, Some(SweepKind::Compact));
    assert_eq!(
        outcome.sweep.adjustments,
        [SweepAdjustment {
            band: None,
            ..expected_adjustment(9.0, "Feedback for a 9.", true)
        }]
    );
    assert!(events.contains(&GradeEvent::SweepStarted {
        kind: SweepKind::Compact
    }));
    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 3);
    assert!(prompts[1].starts_with("CONSISTENCY REVIEW"));
    assert!(prompts[1].contains("[#5] Last5, First5 | Score: 3/10 | Chunk: 1 |"));
}

#[tokio::test]
async fn small_batches_are_not_swept() {
    let provider = ScriptedProvider::new().reply(grades(&[9.0, 9.0, 8.0, 8.0]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 4),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(provider.calls(), 1);
    assert_eq!(outcome.sweep.kind, None);
    assert!(!trace(&events).iter().any(|e| e.starts_with("sweep")));
}

#[tokio::test]
async fn students_who_were_not_graded_do_not_count_toward_the_sweep() {
    // Chunk 1 of 2 is unreadable, leaving two graded students: too few.
    let provider = ScriptedProvider::new()
        .reply("no idea")
        .reply(grades(&[9.0, 9.0]));
    let options = GradeOptions {
        sweep: SweepMode::Auto,
        ..plain_options(5)
    };
    let (outcome, _) = run_batch(&provider, students(0, 7), &options, &CancelFlag::new()).await;

    assert_eq!(provider.calls(), 2);
    assert_eq!(outcome.sweep.kind, None);
}

#[tokio::test]
async fn a_failed_sweep_request_suggests_nothing_and_keeps_the_grades() {
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply(FLAG_STUDENT_3)
        .fail(timeout_error())
        .reply("[]");
    let (outcome, events) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(outcome.sweep.kind, Some(SweepKind::Pairwise));
    assert!(outcome.sweep.adjustments.is_empty());
    assert_eq!(
        outcome.warnings,
        [
            "The consistency sweep failed (ollama request timed out after 600s); it suggests no score changes."
        ]
    );
    // The third band is not asked about once the sweep has failed.
    assert_eq!(provider.calls(), 3);
    assert_eq!(provider.unused_replies(), 1);
    assert_eq!(outcome.results().len(), 6);
    assert_eq!(trace(&events).last().unwrap(), "done (6 graded)");
}

#[tokio::test]
async fn cancelling_during_the_sweep_keeps_every_grade() {
    let cancel = CancelFlag::new();
    let flag = cancel.clone();
    let provider = ScriptedProvider::new()
        .reply(grades(&SCORES))
        .reply(FLAG_STUDENT_3)
        .after_call(move |call| {
            if call == 2 {
                flag.cancel();
            }
        });
    let (outcome, _) = run_batch(
        &provider,
        students(0, 6),
        &options(SweepMode::Auto),
        &cancel,
    )
    .await;

    assert!(outcome.cancelled);
    assert_eq!(provider.calls(), 2);
    assert_eq!(outcome.results().len(), 6);
    assert!(outcome.sweep.adjustments.is_empty());
    assert_eq!(
        outcome.warnings,
        ["The consistency sweep was cancelled before it finished; it suggests no score changes."]
    );
}

fn existing_results() -> Vec<StudentResult> {
    SCORES
        .iter()
        .enumerate()
        .map(|(student_index, &score)| StudentResult {
            student_index,
            score,
            feedback: format!("Feedback for a {score}."),
        })
        .collect()
}

#[tokio::test]
async fn existing_grades_can_be_swept_again_without_regrading_everyone() {
    let provider = ScriptedProvider::new()
        .reply("[]")
        .reply(FLAG_STUDENT_3)
        .reply("[]")
        .reply(grades(&[9.5]));
    let mut events = Vec::new();
    let report = sweep_grades(
        &provider,
        &rubric(),
        &students(0, 6),
        &existing_results(),
        &options(SweepMode::Auto),
        &CancelFlag::new(),
        &mut |event| events.push(event),
    )
    .await
    .expect("the sweep runs");

    assert_eq!(report.sweep.kind, Some(SweepKind::Pairwise));
    assert_eq!(
        report.sweep.adjustments,
        [expected_adjustment(9.5, "Feedback for a 9.5.", true)]
    );
    assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    assert!(!report.cancelled);
    assert_eq!(report.outliers.mean, 7.08);
    assert_eq!(
        trace(&events),
        ["sweep Pairwise", "regrade 1", "review 1", "done (6 graded)"]
    );
    let Some(GradeEvent::Done(summary)) = events.last() else {
        panic!("the last event is Done");
    };
    assert_eq!((summary.total_students, summary.chunks), (6, 0));
    assert_eq!(summary.review_pending, 1);
    assert_eq!(provider.calls(), 4);
}

#[tokio::test]
async fn sweeping_too_few_grades_does_nothing() {
    let provider = ScriptedProvider::new();
    let mut events = Vec::new();
    let report = sweep_grades(
        &provider,
        &rubric(),
        &students(0, 6),
        &existing_results()[..4],
        &options(SweepMode::Auto),
        &CancelFlag::new(),
        &mut |event| events.push(event),
    )
    .await
    .expect("the sweep runs");

    assert_eq!(report.sweep.kind, None);
    assert_eq!(provider.calls(), 0);
    assert_eq!(trace(&events), ["done (4 graded)"]);
}
