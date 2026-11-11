//! The whole-class flow against a scripted provider.

mod common;

use std::time::Duration;

use common::{
    ScriptedProvider, grades, plain_options, rubric, run_batch, scores, student, students,
    timeout_error, trace, unauthorized_error,
};
use ogre_core::{CalibrationExample, CalibrationExamples, Rubric, generate_scoring_anchors};
use ogre_grader::{
    CancelFlag, GradeEvent, GradeOptions, GradeSource, GradeStatus, GraderError, NotGradedReason,
    PriorGrade, grade_batch,
};

const BRIDGE_SECTION: &str = "CALIBRATION EXAMPLES (from previously graded batch";

fn not_graded(reason: NotGradedReason) -> GradeStatus {
    GradeStatus::NotGraded(reason)
}

/// Seven students in an order that is not their index order, so that chunk
/// size 5 gives chunks of five and two.
fn seven_students() -> Vec<ogre_core::StudentWork> {
    [12, 3, 7, 0, 9, 5, 4]
        .into_iter()
        .map(|index| {
            student(
                index,
                &format!("Last{index}, First{index}"),
                &format!("Answer number {index}."),
            )
        })
        .collect()
}

#[tokio::test]
async fn two_chunks_are_graded_end_to_end_with_events_in_order() {
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0, 7.0, 6.0, 5.0]))
        .reply(grades(&[10.0, 4.0]));
    let (outcome, events) = run_batch(
        &provider,
        seven_students(),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    // Results come back in the order the students were given, each matched
    // to the reply by its position in the chunk.
    assert_eq!(
        scores(&outcome.students),
        [
            (12, Some(9.0)),
            (3, Some(8.0)),
            (7, Some(7.0)),
            (0, Some(6.0)),
            (9, Some(5.0)),
            (5, Some(10.0)),
            (4, Some(4.0)),
        ]
    );
    let first = outcome.students[0].grade().expect("graded");
    assert_eq!(outcome.students[0].name, "Last12, First12");
    assert_eq!(first.feedback, "Feedback for a 9.");
    assert_eq!(first.source, GradeSource::Ai);
    assert_eq!(first.revised_from, None);
    assert_eq!(outcome.results().len(), 7);
    assert_eq!(outcome.not_graded().count(), 0);

    assert_eq!(outcome.anchors, generate_scoring_anchors(&rubric()));
    assert_eq!(
        (outcome.outliers.mean, outcome.outliers.std_dev),
        (7.0, 2.0)
    );
    assert!(outcome.outliers.outliers.is_empty());
    assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);
    assert!(!outcome.cancelled);
    assert_eq!(outcome.chunks, 2);
    assert_eq!(outcome.sweep.kind, None);

    assert_eq!(
        trace(&events),
        [
            "start 0",
            "student 12 = 9",
            "student 3 = 8",
            "student 7 = 7",
            "student 0 = 6",
            "student 9 = 5",
            "finish 0 (5 graded, 0 not)",
            "start 1",
            "student 5 = 10",
            "student 4 = 4",
            "finish 1 (2 graded, 0 not)",
            "done (7 graded)",
        ]
    );
    assert_eq!(
        events[0],
        GradeEvent::ChunkStarted {
            chunk_index: 0,
            total_chunks: 2,
            student_count: 5,
            total_students: 7,
        }
    );
    let Some(GradeEvent::Done(summary)) = events.last() else {
        panic!("the last event is Done");
    };
    assert_eq!((summary.mean, summary.std_dev), (7.0, 2.0));
    assert_eq!((summary.total_students, summary.graded), (7, 7));
    assert_eq!(
        (summary.chunks, summary.outliers, summary.review_pending),
        (2, 0, 0)
    );
    assert_eq!(summary.anchors, outcome.anchors);
    assert_eq!(summary.sweep, None);
    assert!(!summary.cancelled);

    // The first chunk has nothing to be calibrated against. The second is
    // shown graded examples from the first.
    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 2);
    assert!(prompts[0].contains("--- Student 12: Last12, First12 ---"));
    assert!(prompts[0].contains("Answer number 9."));
    assert!(!prompts[0].contains("--- Student 5:"));
    assert!(!prompts[0].contains(BRIDGE_SECTION));
    assert!(prompts[1].contains("--- Student 5: Last5, First5 ---"));
    assert!(!prompts[1].contains("--- Student 12:"));
    assert!(prompts[1].contains(BRIDGE_SECTION));
    assert!(prompts[1].contains("\"Last3, First3\" = 8/10"));
}

#[tokio::test]
async fn an_unreadable_reply_leaves_its_chunk_ungraded_and_the_rest_graded() {
    let provider = ScriptedProvider::new()
        .reply("I'm sorry, but I can't grade\nthese responses.")
        .reply(grades(&[7.0, 8.0]));
    let (outcome, events) = run_batch(
        &provider,
        seven_students(),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        scores(&outcome.students),
        [
            (12, None),
            (3, None),
            (7, None),
            (0, None),
            (9, None),
            (5, Some(7.0)),
            (4, Some(8.0)),
        ]
    );
    for ungraded in &outcome.students[..5] {
        assert_eq!(
            ungraded.status,
            not_graded(NotGradedReason::UnreadableReply)
        );
    }
    assert_eq!(outcome.not_graded().count(), 5);
    // Statistics cover real grades only: no zeros stand in for the missing.
    assert_eq!(outcome.outliers.mean, 7.5);

    assert_eq!(
        outcome.warnings,
        [
            "Chunk 1 of 2: the AI's reply could not be read; 5 students not graded. The reply began: I'm sorry, but I can't grade these responses."
        ]
    );
    assert_eq!(
        trace(&events),
        [
            "start 0",
            "warning",
            "student 12 not graded",
            "student 3 not graded",
            "student 7 not graded",
            "student 0 not graded",
            "student 9 not graded",
            "finish 0 (0 graded, 5 not)",
            "start 1",
            "student 5 = 7",
            "student 4 = 8",
            "finish 1 (2 graded, 0 not)",
            "done (2 graded)",
        ]
    );
    // Nothing was graded before the second chunk, so it gets no examples.
    assert!(!provider.prompts()[1].contains(BRIDGE_SECTION));
}

#[tokio::test]
async fn a_null_in_the_reply_makes_the_chunk_unreadable() {
    let provider = ScriptedProvider::new().reply(r#"[{"score": 5, "feedback": "ok"}, null]"#);
    let (outcome, _) = run_batch(
        &provider,
        students(0, 2),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;
    assert_eq!(scores(&outcome.students), [(0, None), (1, None)]);
    assert_eq!(outcome.warnings.len(), 1);
}

#[tokio::test]
async fn a_failed_request_leaves_its_chunk_ungraded_and_the_rest_graded() {
    let provider = ScriptedProvider::new()
        .fail(timeout_error())
        .reply(grades(&[7.0, 8.0]));
    let (outcome, events) = run_batch(
        &provider,
        seven_students(),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    for ungraded in &outcome.students[..5] {
        assert_eq!(
            ungraded.status,
            not_graded(NotGradedReason::ProviderError(timeout_error()))
        );
    }
    assert_eq!(
        scores(&outcome.students[5..]),
        [(5, Some(7.0)), (4, Some(8.0))]
    );
    assert_eq!(
        outcome.warnings,
        [
            "Chunk 1 of 2: the AI request failed (ollama request timed out after 600s); 5 students not graded."
        ]
    );
    assert_eq!(provider.calls(), 2);
    assert_eq!(trace(&events).last().unwrap(), "done (2 graded)");
}

#[tokio::test]
async fn an_error_that_would_repeat_stops_further_requests() {
    let provider = ScriptedProvider::new().fail(unauthorized_error());
    let (outcome, events) = run_batch(
        &provider,
        seven_students(),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(provider.calls(), 1);
    for ungraded in &outcome.students {
        assert_eq!(
            ungraded.status,
            not_graded(NotGradedReason::ProviderError(unauthorized_error()))
        );
    }
    assert_eq!(outcome.warnings.len(), 2);
    assert!(outcome.warnings[0].starts_with("Chunk 1 of 2: the AI request failed"));
    assert!(outcome.warnings[1].contains("2 students were not sent to the AI"));
    assert!(!outcome.cancelled);
    assert_eq!(
        trace(&events),
        [
            "start 0",
            "warning",
            "student 12 not graded",
            "student 3 not graded",
            "student 7 not graded",
            "student 0 not graded",
            "student 9 not graded",
            "finish 0 (0 graded, 5 not)",
            "warning",
            "done (0 graded)",
        ]
    );
}

#[tokio::test]
async fn cancelling_between_chunks_keeps_what_was_graded() {
    let cancel = CancelFlag::new();
    let flag = cancel.clone();
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0, 7.0, 6.0, 5.0]))
        .after_call(move |call| {
            if call == 1 {
                flag.cancel();
            }
        });
    let (outcome, events) =
        run_batch(&provider, seven_students(), &plain_options(5), &cancel).await;

    assert!(outcome.cancelled);
    assert_eq!(provider.calls(), 1);
    assert_eq!(
        scores(&outcome.students),
        [
            (12, Some(9.0)),
            (3, Some(8.0)),
            (7, Some(7.0)),
            (0, Some(6.0)),
            (9, Some(5.0)),
            (5, None),
            (4, None),
        ]
    );
    for waiting in &outcome.students[5..] {
        assert_eq!(waiting.status, not_graded(NotGradedReason::Cancelled));
    }
    assert_eq!(
        outcome.warnings,
        ["Grading was cancelled: 2 students had not been graded yet."]
    );
    let trace = trace(&events);
    assert_eq!(
        trace[trace.len() - 3..],
        ["finish 0 (5 graded, 0 not)", "warning", "done (5 graded)"]
    );
    assert!(!trace.contains(&"start 1".to_owned()));
    let Some(GradeEvent::Done(summary)) = events.last() else {
        panic!("the last event is Done");
    };
    assert!(summary.cancelled);
}

#[tokio::test]
async fn cancelling_before_the_start_sends_nothing() {
    let cancel = CancelFlag::new();
    cancel.cancel();
    let provider = ScriptedProvider::new();
    let options = GradeOptions {
        chunk_size: 5,
        ..GradeOptions::default()
    };
    let (outcome, events) = run_batch(&provider, seven_students(), &options, &cancel).await;

    assert_eq!(provider.calls(), 0);
    assert!(outcome.cancelled);
    assert!(
        outcome
            .students
            .iter()
            .all(|s| s.status == not_graded(NotGradedReason::Cancelled))
    );
    assert_eq!(trace(&events), ["warning", "done (0 graded)"]);
}

#[tokio::test]
async fn students_the_ai_skipped_are_asked_for_once_more() {
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0]))
        .reply(grades(&[6.0]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 3),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        scores(&outcome.students),
        [(0, Some(9.0)), (1, Some(8.0)), (2, Some(6.0))]
    );
    assert_eq!(outcome.warnings.len(), 1);
    let warning = &outcome.warnings[0];
    assert!(
        warning.starts_with("Chunk 1 of 1: the AI returned 2 results for 3 students."),
        "{warning}"
    );
    assert!(warning.contains("wrong students"), "{warning}");

    let prompts = provider.prompts();
    assert_eq!(prompts.len(), 2);
    assert!(prompts[1].contains("--- Student 2: Last2, First2 ---"));
    assert!(!prompts[1].contains("--- Student 0:"));
    assert!(!prompts[1].contains(BRIDGE_SECTION));
    assert_eq!(
        trace(&events),
        [
            "start 0",
            "warning",
            "student 0 = 9",
            "student 1 = 8",
            "student 2 = 6",
            "finish 0 (3 graded, 0 not)",
            "done (3 graded)",
        ]
    );
}

#[tokio::test]
async fn a_student_skipped_twice_is_not_graded() {
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0]))
        .reply("[]");
    let (outcome, _) = run_batch(
        &provider,
        students(0, 3),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        scores(&outcome.students),
        [(0, Some(9.0)), (1, Some(8.0)), (2, None)]
    );
    assert_eq!(
        outcome.students[2].status,
        not_graded(NotGradedReason::SkippedByAi)
    );
    assert_eq!(outcome.warnings.len(), 2);
    assert_eq!(
        outcome.warnings[1],
        "Chunk 1 of 1, second request: the AI returned 0 results for 1 student; the rest were not graded."
    );
}

#[tokio::test]
async fn a_failed_second_request_keeps_the_first_results() {
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0]))
        .fail(timeout_error());
    let (outcome, _) = run_batch(
        &provider,
        students(0, 3),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        score_pairs(&outcome),
        [(0, Some(9.0)), (1, None), (2, None)]
    );
    for ungraded in &outcome.students[1..] {
        assert_eq!(
            ungraded.status,
            not_graded(NotGradedReason::ProviderError(timeout_error()))
        );
    }
}

fn score_pairs(outcome: &ogre_grader::BatchOutcome) -> Vec<(usize, Option<f64>)> {
    scores(&outcome.students)
}

#[tokio::test]
async fn a_chunk_of_blank_responses_is_not_sent_to_the_ai() {
    let blank = vec![student(0, "Avery, Sam", ""), student(1, "", " \n\t")];
    let provider = ScriptedProvider::new();
    let (outcome, events) =
        run_batch(&provider, blank, &plain_options(5), &CancelFlag::new()).await;

    assert_eq!(provider.calls(), 0);
    assert_eq!(scores(&outcome.students), [(0, Some(0.0)), (1, Some(0.0))]);
    let sam = outcome.students[0].grade().expect("graded");
    assert_eq!(sam.source, GradeSource::NoResponse);
    assert!(sam.feedback.starts_with("<p>Hi Sam,</p><p><strong>States the Central Limit Theorem</strong></p><blockquote>You did not address this.</blockquote>"));
    let nameless = outcome.students[1].grade().expect("graded");
    assert!(nameless.feedback.starts_with("<p>Hello,</p>"));
    assert_eq!(
        trace(&events),
        [
            "start 0",
            "student 0 = 0",
            "student 1 = 0",
            "finish 0 (2 graded, 0 not)",
            "done (2 graded)",
        ]
    );
}

#[tokio::test]
async fn a_blank_response_among_answers_goes_to_the_ai_with_the_rest() {
    let mixed = vec![
        student(0, "Avery, Sam", ""),
        student(1, "Lee, Jo", "An answer."),
    ];
    let provider = ScriptedProvider::new().reply(grades(&[0.0, 7.0]));
    let (outcome, _) = run_batch(&provider, mixed, &plain_options(5), &CancelFlag::new()).await;

    assert_eq!(scores(&outcome.students), [(0, Some(0.0)), (1, Some(7.0))]);
    assert_eq!(
        outcome.students[0].grade().expect("graded").source,
        GradeSource::Ai
    );
    assert!(provider.prompts()[0].contains("(No response submitted)"));
}

#[tokio::test]
async fn examples_never_cross_between_versions_of_the_question() {
    // Version A has six students (two chunks), version B two (one chunk).
    let mut class = Vec::new();
    for index in 0..8 {
        let mut work = student(index, &format!("Student{index}"), "An answer.");
        work.prompt = Some(if index == 2 || index == 5 {
            "Explain what a residual is.".to_owned()
        } else {
            format!("Predict y when x = {index}.")
        });
        class.push(work);
    }
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0, 7.0, 6.0, 5.0]))
        .reply(grades(&[8.0]))
        .reply(grades(&[4.0, 3.0]));
    let (outcome, _) = run_batch(&provider, class, &plain_options(5), &CancelFlag::new()).await;

    assert_eq!(outcome.chunks, 3);
    assert_eq!(
        scores(&outcome.students),
        [
            (0, Some(9.0)),
            (1, Some(8.0)),
            (2, Some(4.0)),
            (3, Some(7.0)),
            (4, Some(6.0)),
            (5, Some(3.0)),
            (6, Some(5.0)),
            (7, Some(8.0)),
        ]
    );
    let prompts = provider.prompts();
    assert!(!prompts[0].contains(BRIDGE_SECTION));
    assert!(prompts[1].contains(BRIDGE_SECTION));
    assert!(prompts[1].contains("--- Student 7: Student7 ---"));
    // The first chunk of version B is not shown version A's graded answers.
    assert!(prompts[2].contains("--- Student 2: Student2 ---"));
    assert!(!prompts[2].contains(BRIDGE_SECTION));
}

#[tokio::test]
async fn calibration_examples_go_into_every_chunk_prompt() {
    let options = GradeOptions {
        calibration_examples: Some(CalibrationExamples {
            total: 1.0,
            excellent: Some(CalibrationExample {
                grading_score: 9.0,
                feedback: "A past answer that covered everything.".to_owned(),
            }),
            adequate: None,
            minimal: None,
        }),
        ..plain_options(5)
    };
    let provider = ScriptedProvider::new()
        .reply(grades(&[9.0, 8.0, 7.0, 6.0, 5.0]))
        .reply(grades(&[10.0, 4.0]));
    run_batch(&provider, seven_students(), &options, &CancelFlag::new()).await;

    for prompt in provider.prompts() {
        assert!(prompt.contains("HISTORICAL CALIBRATION EXAMPLES"));
        assert!(prompt.contains("A past answer that covered everything."));
    }
}

/// Eight students of whom the last scores far from the rest.
fn class_with_outlier(common: f64, outlier: f64) -> String {
    let mut all = vec![common; 7];
    all.push(outlier);
    grades(&all)
}

fn reviewing_options() -> GradeOptions {
    GradeOptions {
        outlier_review: true,
        ..plain_options(30)
    }
}

#[tokio::test]
async fn the_outlier_review_is_off_unless_asked_for() {
    let provider = ScriptedProvider::new().reply(class_with_outlier(8.0, 2.0));
    let (outcome, _) = run_batch(
        &provider,
        students(0, 8),
        &plain_options(30),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(provider.calls(), 1);
    assert_eq!(outcome.outliers.outliers.len(), 1);
    assert_eq!(outcome.outliers.outliers[0].student_index, 7);
    assert_eq!(common::score_of(&outcome.students[7]), Some(2.0));
}

#[tokio::test]
async fn the_outlier_review_can_raise_a_score() {
    let provider = ScriptedProvider::new()
        .reply(class_with_outlier(8.0, 2.0))
        .reply(grades(&[6.0]));
    let (outcome, events) = run_batch(
        &provider,
        students(0, 8),
        &reviewing_options(),
        &CancelFlag::new(),
    )
    .await;

    let revised = outcome.students[7].grade().expect("graded");
    assert_eq!(revised.score, 6.0);
    assert_eq!(revised.feedback, "Feedback for a 6.");
    assert_eq!(
        revised.revised_from,
        Some(PriorGrade {
            score: 2.0,
            feedback: "Feedback for a 2.".to_owned(),
            deviation: 2.65,
        })
    );
    // Everyone else is untouched.
    assert!(outcome.students[..7].iter().all(|s| {
        let grade = s.grade().expect("graded");
        grade.score == 8.0 && grade.revised_from.is_none()
    }));
    // The statistics describe the scores as first graded.
    assert_eq!(outcome.outliers.mean, 7.25);
    assert_eq!(outcome.outliers.outliers[0].score, 2.0);
    assert!(outcome.warnings.is_empty(), "{:?}", outcome.warnings);

    let trace = trace(&events);
    assert_eq!(
        trace[trace.len() - 4..],
        [
            "finish 0 (8 graded, 0 not)",
            "outlier review 1",
            "outliers adjusted 1",
            "done (8 graded)",
        ]
    );
    let adjusted = events
        .iter()
        .find_map(|event| match event {
            GradeEvent::OutliersAdjusted { students } => Some(students),
            _ => None,
        })
        .expect("an adjustment event");
    assert_eq!(adjusted[..], outcome.students[7..]);

    let review_prompt = &provider.prompts()[1];
    assert!(review_prompt.contains("SECOND-PASS REVIEW"));
    assert!(review_prompt.contains("--- Student 7: Last7, First7 ---"));
    assert!(review_prompt.contains("ORIGINAL SCORE: 2/10"));
    assert!(!review_prompt.contains("--- Student 0:"));
}

#[tokio::test]
async fn the_outlier_review_lowers_a_score_by_one_point_at_most() {
    // Eight students at 3, one at 10 and one at 9.5: only the 10 is beyond
    // two standard deviations, and the 9.5 is its peer.
    let mut all = vec![3.0; 8];
    all.extend([10.0, 9.5]);
    let provider = ScriptedProvider::new()
        .reply(grades(&all))
        .reply(grades(&[6.0]));
    let (outcome, _) = run_batch(
        &provider,
        students(0, 10),
        &reviewing_options(),
        &CancelFlag::new(),
    )
    .await;

    let revised = outcome.students[8].grade().expect("graded");
    assert_eq!(revised.score, 9.0);
    assert_eq!(
        revised.revised_from.as_ref().map(|prior| prior.score),
        Some(10.0)
    );
    assert_eq!(common::score_of(&outcome.students[9]), Some(9.5));

    let review_prompt = &provider.prompts()[1];
    assert!(review_prompt.contains("PEER COMPARISON"));
    assert!(review_prompt.contains("[Score 9.5/10]: Answer number 9 about the theorem."));
}

#[tokio::test]
async fn an_unreadable_outlier_review_changes_nothing() {
    let provider = ScriptedProvider::new()
        .reply(class_with_outlier(8.0, 2.0))
        .reply("These all look fine to me.");
    let (outcome, events) = run_batch(
        &provider,
        students(0, 8),
        &reviewing_options(),
        &CancelFlag::new(),
    )
    .await;

    let kept = outcome.students[7].grade().expect("graded");
    assert_eq!((kept.score, kept.revised_from.as_ref()), (2.0, None));
    assert_eq!(
        outcome.warnings,
        [
            "The outlier review's reply could not be read; the original scores are kept. The reply began: These all look fine to me."
        ]
    );
    assert!(
        !trace(&events)
            .iter()
            .any(|e| e.starts_with("outliers adjusted"))
    );
}

#[tokio::test]
async fn a_failed_outlier_review_changes_nothing() {
    let provider = ScriptedProvider::new()
        .reply(class_with_outlier(8.0, 2.0))
        .fail(timeout_error());
    let (outcome, _) = run_batch(
        &provider,
        students(0, 8),
        &reviewing_options(),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(common::score_of(&outcome.students[7]), Some(2.0));
    assert_eq!(outcome.warnings.len(), 1);
    assert!(outcome.warnings[0].starts_with("The outlier review failed"));
}

#[tokio::test]
async fn an_outlier_who_submitted_nothing_is_not_reviewed() {
    let mut class = students(0, 8);
    class[7].response = String::new();
    let provider = ScriptedProvider::new().reply(class_with_outlier(8.0, 0.0));
    let (outcome, events) =
        run_batch(&provider, class, &reviewing_options(), &CancelFlag::new()).await;

    assert_eq!(provider.calls(), 1);
    assert_eq!(outcome.outliers.outliers.len(), 1);
    assert_eq!(common::score_of(&outcome.students[7]), Some(0.0));
    assert!(
        !trace(&events)
            .iter()
            .any(|e| e.starts_with("outlier review"))
    );
}

#[tokio::test(start_paused = true)]
async fn heartbeats_are_sent_while_a_request_is_pending() {
    let provider =
        ScriptedProvider::new().reply_after(Duration::from_secs(95), grades(&[9.0, 8.0]));
    let options = GradeOptions {
        heartbeat: Some(Duration::from_secs(30)),
        ..plain_options(5)
    };
    let (outcome, events) =
        run_batch(&provider, students(0, 2), &options, &CancelFlag::new()).await;

    assert_eq!(
        trace(&events),
        [
            "start 0",
            "heartbeat 30s",
            "heartbeat 60s",
            "heartbeat 90s",
            "student 0 = 9",
            "student 1 = 8",
            "finish 0 (2 graded, 0 not)",
            "done (2 graded)",
        ]
    );
    assert_eq!(outcome.elapsed, Duration::from_secs(95));
}

#[tokio::test]
async fn bad_input_is_refused_before_anything_is_sent() {
    let provider = ScriptedProvider::new();
    let cancel = CancelFlag::new();
    let options = GradeOptions::default();
    let mut ignore = |_event: GradeEvent| {};

    let none = grade_batch(&provider, &rubric(), vec![], &options, &cancel, &mut ignore).await;
    assert_eq!(none, Err(GraderError::NoStudents));

    let twice = vec![student(4, "A", "x"), student(4, "B", "y")];
    let repeated = grade_batch(&provider, &rubric(), twice, &options, &cancel, &mut ignore).await;
    assert_eq!(repeated, Err(GraderError::DuplicateStudentIndex(4)));

    let uncategorized: Rubric =
        serde_json::from_str(r#"{"checklistItems": [{"items": ["Shows the work"]}]}"#).unwrap();
    let unusable = grade_batch(
        &provider,
        &uncategorized,
        students(0, 2),
        &options,
        &cancel,
        &mut ignore,
    )
    .await;
    assert!(
        matches!(unusable, Err(GraderError::Rubric(_))),
        "{unusable:?}"
    );

    assert_eq!(provider.calls(), 0);
}

#[test]
fn a_batch_can_run_on_another_thread() {
    fn assert_send<T: Send>(_: &T) {}
    let provider = ScriptedProvider::new();
    let rubric = rubric();
    let options = GradeOptions::default();
    let cancel = CancelFlag::new();
    let mut ignore = |_event: GradeEvent| {};
    let batch = grade_batch(
        &provider,
        &rubric,
        students(0, 1),
        &options,
        &cancel,
        &mut ignore,
    );
    assert_send(&batch);
}

#[tokio::test]
async fn a_result_without_a_score_is_not_a_zero() {
    // The second result has feedback but no score; the third has a score the
    // AI wrote as words. A real zero is kept as a grade.
    let reply = serde_json::json!([
        { "studentIndex": 0, "score": 8, "feedback": "Feedback for an 8." },
        { "studentIndex": 1, "feedback": "Good effort overall." },
        { "studentIndex": 2, "score": "eight", "feedback": "Solid." },
        { "studentIndex": 3, "score": 0, "feedback": "This does not address the question." },
    ])
    .to_string();
    let provider = ScriptedProvider::new().reply(reply);
    let (outcome, _) = run_batch(
        &provider,
        students(0, 4),
        &plain_options(5),
        &CancelFlag::new(),
    )
    .await;

    assert_eq!(
        outcome
            .students
            .iter()
            .map(|student| student.status.clone())
            .map(|status| match status {
                GradeStatus::Graded(grade) => Ok(grade.score),
                GradeStatus::NotGraded(reason) => Err(reason),
            })
            .collect::<Vec<_>>(),
        [
            Ok(8.0),
            Err(NotGradedReason::NoScore),
            Err(NotGradedReason::NoScore),
            Ok(0.0),
        ]
    );
    let about_scores: Vec<_> = outcome
        .warnings
        .iter()
        .filter(|warning| warning.contains("gave no score"))
        .collect();
    assert_eq!(about_scores.len(), 2, "{:?}", outcome.warnings);
    assert!(about_scores[0].contains("Last1, First1"));
    // Students without a grade do not pull the class average down.
    assert_eq!(outcome.outliers.mean, 4.0);
}
