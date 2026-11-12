//! Grading a whole class: chunk by chunk, then the end-of-run checks.

use std::collections::{BTreeMap, HashMap, HashSet};

use ogre_core::{
    BridgeResponse, CalibrationExamples, CheckedResult, Chunk, Rubric, StudentResult, StudentWork,
    build_batch_prompt, chunk_students_by_prompt, detect_outliers, extract_first_name,
    merge_results, score_from_verdicts,
};
use ogre_llm::ChatProvider;

use crate::bridge::build_bridge_responses;
use crate::error::GraderError;
use crate::options::{CancelFlag, GradeOptions, ScoreSource, SweepMode};
use crate::outcome::{
    BatchOutcome, Grade, GradeEvent, GradeSource, GradeStatus, NotGradedReason, StudentOutcome,
    Summary, SweepOutcome,
};
use crate::session::{Job, Session, Stop};
use crate::text::{is_blank, plural, snippet};
use crate::{outlier, sweep};

/// The graded results and students of the chunks seen so far for one version
/// of the question. Bridge examples for a chunk come only from its own
/// version's pool, so one version never calibrates another.
#[derive(Default)]
struct BridgePool {
    results: Vec<StudentResult>,
    students: Vec<StudentWork>,
}

/// Grades every student against the rubric.
///
/// Students are grouped by the question they saw and sent in chunks, each
/// chunk with examples graded in earlier chunks of the same group. When all
/// chunks are done, the optional outlier review and the consistency sweep
/// run. `on_event` is told about each step as it happens.
///
/// A chunk that fails does not stop the batch: its students are reported as
/// [`GradeStatus::NotGraded`] with a warning. Requests stop early only when
/// `cancel` is set or the provider fails in a way that would repeat, such as
/// a rejected API key. Either way the students graded so far are returned.
///
/// Fails only before anything is sent: no students, a repeated student
/// index, or a rubric no prompt can be built from.
pub async fn grade_batch(
    provider: &dyn ChatProvider,
    rubric: &Rubric,
    students: Vec<StudentWork>,
    options: &GradeOptions,
    cancel: &CancelFlag,
    on_event: &mut (dyn FnMut(GradeEvent) + Send),
) -> Result<BatchOutcome, GraderError> {
    if students.is_empty() {
        return Err(GraderError::NoStudents);
    }
    let mut seen = HashSet::with_capacity(students.len());
    if let Some(repeated) = students.iter().find(|s| !seen.insert(s.index)) {
        return Err(GraderError::DuplicateStudentIndex(repeated.index));
    }

    let mut job = Job::new(rubric);
    job.score_source = options.score_source;
    // A rubric that cannot be turned into a prompt fails every chunk alike.
    // Building a prompt for nobody finds that out before anything is sent.
    build_batch_prompt(rubric, &[], &job.anchors, None, None)?;

    let mut session = Session::new(provider, cancel, on_event, options.heartbeat);
    let chunks = chunk_students_by_prompt(
        students.clone(),
        options.effective_chunk_size(),
        rubric.essay_prompt.as_deref().unwrap_or(""),
    );

    let mut statuses: HashMap<usize, GradeStatus> = HashMap::with_capacity(students.len());
    let mut graded_by_chunk: Vec<Vec<StudentResult>> = Vec::with_capacity(chunks.len());
    let mut chunk_map: BTreeMap<usize, usize> = BTreeMap::new();
    let mut pools: HashMap<&str, BridgePool> = HashMap::new();

    for chunk in &chunks {
        if session.check_cancelled() {
            break;
        }
        session.emit(GradeEvent::ChunkStarted {
            chunk_index: chunk.chunk_index,
            total_chunks: chunks.len(),
            student_count: chunk.students.len(),
            total_students: students.len(),
        });

        let group = chunk.prompt_key.as_deref().unwrap_or("");
        let bridges = pools
            .get(group)
            .filter(|pool| !pool.results.is_empty())
            .map(|pool| build_bridge_responses(&pool.results, &pool.students, &job.anchors));
        let label = format!("Chunk {} of {}", chunk.chunk_index + 1, chunks.len());
        let chunk_statuses = grade_chunk(
            &mut session,
            &job,
            chunk,
            &label,
            bridges.as_deref(),
            options.calibration_examples.as_ref(),
        )
        .await?;

        let mut graded = Vec::new();
        for (student, status) in chunk.students.iter().zip(chunk_statuses) {
            if let GradeStatus::Graded(grade) = &status {
                graded.push(StudentResult {
                    student_index: student.index,
                    score: grade.score,
                    feedback: grade.feedback.clone(),
                });
                chunk_map.insert(student.index, chunk.chunk_index);
            }
            session.emit(GradeEvent::Student(StudentOutcome {
                student_index: student.index,
                name: student.name.clone(),
                status: status.clone(),
            }));
            statuses.insert(student.index, status);
        }
        session.emit(GradeEvent::ChunkFinished {
            chunk_index: chunk.chunk_index,
            graded: graded.len(),
            not_graded: chunk.students.len() - graded.len(),
        });

        let pool = pools.entry(group).or_default();
        pool.results.extend(graded.iter().cloned());
        pool.students.extend(chunk.students.iter().cloned());
        graded_by_chunk.push(graded);

        if session.stopped() {
            break;
        }
    }

    let unsent_reason = match session.fatal() {
        Some(error) if !session.cancelled() => NotGradedReason::ProviderError(error.clone()),
        _ => NotGradedReason::Cancelled,
    };
    let unsent = students
        .iter()
        .filter(|s| !statuses.contains_key(&s.index))
        .count();
    if session.cancelled() {
        let waiting = unsent
            + statuses
                .values()
                .filter(|s| matches!(s, GradeStatus::NotGraded(NotGradedReason::Cancelled)))
                .count();
        session.warn(format!(
            "Grading was cancelled: {} had not been graded yet.",
            plural(waiting, "student")
        ));
    } else if let (Some(error), true) = (session.fatal(), unsent > 0) {
        let message = format!(
            "Stopped sending requests because the next ones would fail the same way ({error}): {} were not sent to the AI.",
            plural(unsent, "student")
        );
        session.warn(message);
    }

    let mut results = merge_results(graded_by_chunk);
    let outliers = detect_outliers(&results);

    if options.outlier_review && !session.stopped() {
        let revisions = outlier::review(&mut session, &job, &students, &results, &outliers).await;
        let mut revised = Vec::with_capacity(revisions.len());
        for revision in revisions {
            let Some(GradeStatus::Graded(grade)) = statuses.get_mut(&revision.student_index) else {
                continue;
            };
            grade.score = revision.score;
            grade.feedback = revision.feedback.clone();
            grade.revised_from = Some(revision.prior);
            if let Some(result) = results
                .iter_mut()
                .find(|r| r.student_index == revision.student_index)
            {
                result.score = revision.score;
                result.feedback = revision.feedback;
            }
            let name = students
                .iter()
                .find(|s| s.index == revision.student_index)
                .map(|s| s.name.clone())
                .unwrap_or_default();
            revised.push(StudentOutcome {
                student_index: revision.student_index,
                name,
                status: GradeStatus::Graded(grade.clone()),
            });
        }
        if !revised.is_empty() {
            session.emit(GradeEvent::OutliersAdjusted { students: revised });
        }
    }

    let sweep = if session.stopped() {
        SweepOutcome::default()
    } else {
        sweep::run(
            &mut session,
            &job,
            &students,
            &results,
            &chunk_map,
            // The check evens out the AI's own scores. Scores worked out
            // from the verdicts are even already.
            match options.score_source {
                ScoreSource::Ai => options.sweep,
                ScoreSource::Verdicts => SweepMode::None,
            },
        )
        .await?
    };

    let elapsed = session.elapsed();
    let cancelled = session.cancelled();
    session.emit(GradeEvent::Done(Summary {
        mean: outliers.mean,
        std_dev: outliers.std_dev,
        outliers: outliers.outliers.len(),
        review_pending: sweep.adjustments.len(),
        anchors: job.anchors.clone(),
        total_students: students.len(),
        graded: results.len(),
        chunks: chunks.len(),
        sweep: sweep.kind,
        elapsed,
        cancelled,
    }));

    let outcomes = students
        .into_iter()
        .map(|student| StudentOutcome {
            status: statuses
                .remove(&student.index)
                .unwrap_or_else(|| GradeStatus::NotGraded(unsent_reason.clone())),
            student_index: student.index,
            name: student.name,
        })
        .collect();

    Ok(BatchOutcome {
        students: outcomes,
        anchors: job.anchors,
        outliers,
        sweep,
        warnings: session.into_warnings(),
        cancelled,
        chunks: chunks.len(),
        elapsed,
    })
}

/// Grades one chunk. The statuses line up with the chunk's students.
async fn grade_chunk(
    session: &mut Session<'_>,
    job: &Job<'_>,
    chunk: &Chunk,
    label: &str,
    bridges: Option<&[BridgeResponse]>,
    calibration: Option<&CalibrationExamples>,
) -> Result<Vec<GradeStatus>, GraderError> {
    let students = chunk.students.as_slice();

    // With no answer of the student's own to read, a model fills its feedback
    // with numbers from the examples it was shown, so it is not asked.
    if students.iter().all(|s| is_blank(&s.response)) {
        return Ok(students
            .iter()
            .map(|student| {
                GradeStatus::Graded(Grade {
                    score: 0.0,
                    feedback: blank_response_feedback(job.rubric, student),
                    source: GradeSource::NoResponse,
                    revised_from: None,
                })
            })
            .collect());
    }

    let prompt = build_batch_prompt(job.rubric, students, &job.anchors, bridges, calibration)?;
    let mut results = match request(session, job, prompt, students, label).await {
        Ok(results) => results,
        Err(reason) => return Ok(vec![GradeStatus::NotGraded(reason); students.len()]),
    };

    let mut missing_reason = NotGradedReason::SkippedByAi;
    if results.len() < students.len() {
        let missing = &students[results.len()..];
        session.warn(format!(
            "{label}: the AI returned {} for {}. Results are matched to students in order, so unless it left out exactly the last {}, the scores in this chunk are attached to the wrong students. Check this chunk by hand. Asking once more for the last {}.",
            plural(results.len(), "result"),
            plural(students.len(), "student"),
            missing.len(),
            missing.len(),
        ));
        // The grading server sent this second request without bridge examples.
        let prompt = build_batch_prompt(job.rubric, missing, &job.anchors, None, calibration)?;
        let second = format!("{label}, second request");
        match request(session, job, prompt, missing, &second).await {
            Ok(more) => {
                if more.len() < missing.len() {
                    session.warn(format!(
                        "{second}: the AI returned {} for {}; the rest were not graded.",
                        plural(more.len(), "result"),
                        plural(missing.len(), "student"),
                    ));
                }
                results.extend(more);
            }
            Err(reason) => missing_reason = reason,
        }
    }

    let mut statuses: Vec<GradeStatus> = Vec::with_capacity(students.len());
    let mut kept_ai_score = 0;
    for (checked, student) in results.into_iter().zip(students) {
        let from_verdicts = match job.score_source {
            ScoreSource::Ai => None,
            ScoreSource::Verdicts => score_from_verdicts(&checked.result.feedback, job.rubric),
        };
        if from_verdicts.is_some() || checked.score_given {
            // A blank answer has no verdicts to read and no need of them.
            if job.score_source == ScoreSource::Verdicts
                && from_verdicts.is_none()
                && !is_blank(&student.response)
            {
                kept_ai_score += 1;
            }
            statuses.push(GradeStatus::Graded(Grade {
                score: from_verdicts.unwrap_or(checked.result.score),
                feedback: checked.result.feedback,
                source: GradeSource::Ai,
                revised_from: None,
            }));
        } else {
            // The parser would read this as a zero. It is not a grade.
            session.warn(format!(
                "{label}: the AI gave no score for {}; not graded.",
                student.name
            ));
            statuses.push(GradeStatus::NotGraded(NotGradedReason::NoScore));
        }
    }
    if kept_ai_score > 0 {
        session.warn(format!(
            "{label}: the feedback for {} does not have one verdict per requirement, \
             so the AI's own score was kept there.",
            plural(kept_ai_score, "student"),
        ));
    }
    statuses.resize(students.len(), GradeStatus::NotGraded(missing_reason));
    Ok(statuses)
}

/// Sends one grading prompt and reads the reply. On failure, warns and gives
/// the reason none of `students` were graded.
async fn request(
    session: &mut Session<'_>,
    job: &Job<'_>,
    prompt: String,
    students: &[StudentWork],
    label: &str,
) -> Result<Vec<CheckedResult>, NotGradedReason> {
    let count = plural(students.len(), "student");
    match session.ask(prompt).await {
        Err(Stop::Cancelled) => Err(NotGradedReason::Cancelled),
        Err(Stop::Failed(error)) => {
            session.warn(format!(
                "{label}: the AI request failed ({error}); {count} not graded."
            ));
            Err(NotGradedReason::ProviderError(error))
        }
        Ok(reply) => match job.read_checked(&reply, students) {
            Some(results) => Ok(results),
            None => {
                session.warn(format!(
                    "{label}: the AI's reply could not be read; {count} not graded. The reply began: {}",
                    snippet(&reply)
                ));
                Err(NotGradedReason::UnreadableReply)
            }
        },
    }
}

/// Stock feedback for a student who submitted nothing: every requirement
/// marked as not addressed.
pub fn blank_response_feedback(rubric: &Rubric, student: &StudentWork) -> String {
    let mut html = match extract_first_name(&student.name) {
        "" => "<p>Hello,</p>".to_owned(),
        first_name => format!("<p>Hi {first_name},</p>"),
    };
    let mut requirements = rubric
        .checklist_items
        .iter()
        .flat_map(|item| &item.items)
        .peekable();
    if requirements.peek().is_none() {
        html.push_str("<p>No response was submitted, so this question was not evaluated.</p>");
    }
    for requirement in requirements {
        html += &format!(
            "<p><strong>{requirement}</strong></p><blockquote>You did not address this.</blockquote><p>No response was submitted, so this requirement was not evaluated.</p>"
        );
    }
    html
}
