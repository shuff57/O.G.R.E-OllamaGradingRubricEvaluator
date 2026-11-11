//! The consistency sweep: after grading, ask the AI whether students with
//! similar answers got similar scores, and report what it would change.

use std::collections::BTreeMap;

use ogre_core::{
    Rubric, ScoreBand, StudentResult, StudentWork, build_batch_prompt, build_compact_sweep_prompt,
    build_pairwise_sweep_prompts, detect_outliers,
};
use ogre_llm::ChatProvider;
use serde_json::Value;

use crate::error::GraderError;
use crate::options::{CancelFlag, GradeOptions, SweepKind, SweepMode};
use crate::outcome::{GradeEvent, Summary, SweepAdjustment, SweepOutcome, SweepReport};
use crate::session::{Job, Session, Stop};
use crate::text::{display_name, plural, snippet};

/// Runs the consistency sweep on grades that already exist, without grading
/// anyone again. Use it to retry a sweep that failed, to sweep with a
/// different model, or to re-check after scores were edited by hand.
///
/// `students` and `results` are matched by student index. The suggestions
/// are returned and sent as a [`GradeEvent::Review`]; nothing is changed.
pub async fn sweep_grades(
    provider: &dyn ChatProvider,
    rubric: &Rubric,
    students: &[StudentWork],
    results: &[StudentResult],
    options: &GradeOptions,
    cancel: &CancelFlag,
    on_event: &mut (dyn FnMut(GradeEvent) + Send),
) -> Result<SweepReport, GraderError> {
    let job = Job::new(rubric);
    build_batch_prompt(rubric, &[], &job.anchors, None, None)?;
    let mut session = Session::new(provider, cancel, on_event, options.heartbeat);

    // Nothing is known about how these grades were chunked.
    let chunk_map: BTreeMap<usize, usize> = results.iter().map(|r| (r.student_index, 0)).collect();
    let sweep = run(
        &mut session,
        &job,
        students,
        results,
        &chunk_map,
        options.sweep,
    )
    .await?;

    let outliers = detect_outliers(results);
    let elapsed = session.elapsed();
    let cancelled = session.cancelled();
    session.emit(GradeEvent::Done(Summary {
        mean: outliers.mean,
        std_dev: outliers.std_dev,
        outliers: outliers.outliers.len(),
        review_pending: sweep.adjustments.len(),
        anchors: job.anchors.clone(),
        total_students: results.len(),
        graded: results.len(),
        chunks: 0,
        sweep: sweep.kind,
        elapsed,
        cancelled,
    }));

    Ok(SweepReport {
        sweep,
        anchors: job.anchors,
        outliers,
        warnings: session.into_warnings(),
        cancelled,
        elapsed,
    })
}

/// Finds the list of adjustments in a sweep reply: everything from the first
/// `[` to the last `]`, read as JSON. Code fences and prose around the list
/// are ignored. `None` if there is no such list or it is not valid JSON.
pub fn parse_sweep_adjustments(text: &str) -> Option<Vec<Value>> {
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&text[start..=end]).ok()
}

/// A student the sweep wants looked at again.
struct Flag {
    student_index: usize,
    band: Option<ScoreBand>,
    /// The score the sweep suggested, as the AI wrote it.
    suggested: Value,
    feedback: Option<String>,
    reason: Option<String>,
}

pub(crate) async fn run(
    session: &mut Session<'_>,
    job: &Job<'_>,
    students: &[StudentWork],
    results: &[StudentResult],
    chunk_map: &BTreeMap<usize, usize>,
    mode: SweepMode,
) -> Result<SweepOutcome, GraderError> {
    let Some(kind) = mode.kind(results.len()) else {
        return Ok(SweepOutcome::default());
    };
    let nothing = SweepOutcome {
        kind: Some(kind),
        adjustments: Vec::new(),
    };
    session.emit(GradeEvent::SweepStarted { kind });

    let flags = match collect_flags(session, job, students, results, chunk_map, kind).await {
        Ok(flags) => flags,
        Err(stop) => {
            warn_unfinished(session, stop);
            return Ok(nothing);
        }
    };
    if flags.is_empty() {
        return Ok(nothing);
    }

    // The sweep's own suggested feedback is usually a stub, because its
    // prompt is about comparing scores. The flagged students go through the
    // grading prompt again, and that grade is the suggestion.
    let flagged: Vec<StudentWork> = flags
        .iter()
        .filter_map(|flag| students.iter().find(|s| s.index == flag.student_index))
        .cloned()
        .collect();
    session.emit(GradeEvent::SweepRegrade {
        count: flagged.len(),
    });
    let prompt = build_batch_prompt(job.rubric, &flagged, &job.anchors, None, None)?;
    let regraded = match session.ask(prompt).await {
        Err(Stop::Cancelled) => {
            warn_unfinished(session, Stop::Cancelled);
            return Ok(nothing);
        }
        Err(Stop::Failed(error)) => {
            session.warn(format!(
                "Consistency sweep: re-grading the flagged students failed ({error}); showing the sweep's own shorter suggestions instead."
            ));
            Vec::new()
        }
        Ok(reply) => match job.read(&reply, &flagged) {
            Some(regraded) => {
                if regraded.len() != flagged.len() {
                    session.warn(format!(
                        "Consistency sweep: the re-grade returned {} for {}. Results are matched to students in order, so its suggestions may be attached to the wrong students.",
                        plural(regraded.len(), "result"),
                        plural(flagged.len(), "flagged student"),
                    ));
                }
                regraded
            }
            None => {
                session.warn(format!(
                    "Consistency sweep: the re-grade reply could not be read; showing the sweep's own shorter suggestions instead. The reply began: {}",
                    snippet(&reply)
                ));
                Vec::new()
            }
        },
    };

    let mut adjustments = Vec::new();
    for flag in flags {
        let index = flag.student_index;
        let (Some(student), Some(original)) = (
            students.iter().find(|s| s.index == index),
            results.iter().find(|r| r.student_index == index),
        ) else {
            continue;
        };
        let name = display_name(Some(student), index);

        let (suggested_score, suggested_feedback, was_regraded) = match regraded
            .iter()
            .find(|r| r.student_index == index)
        {
            Some(grade) => (grade.score, Some(grade.feedback.clone()), true),
            None => match usable_score(&flag.suggested, job.max_score) {
                Some(score) => (score, flag.feedback, false),
                None => {
                    session.warn(format!(
                            "Consistency sweep: dropped the suggestion for {name}; its score ({}) is not a number from 0 to {}.",
                            flag.suggested, job.max_score
                        ));
                    continue;
                }
            },
        };
        if suggested_score == original.score {
            continue;
        }
        adjustments.push(SweepAdjustment {
            student_index: index,
            name: student.name.clone(),
            band: flag.band,
            original_score: original.score,
            original_feedback: original.feedback.clone(),
            suggested_score,
            suggested_feedback,
            reason: flag.reason,
            regraded: was_regraded,
        });
    }

    if !adjustments.is_empty() {
        session.emit(GradeEvent::Review {
            adjustments: adjustments.clone(),
        });
    }
    Ok(SweepOutcome {
        kind: Some(kind),
        adjustments,
    })
}

fn warn_unfinished(session: &mut Session<'_>, stop: Stop) {
    session.warn(match stop {
        Stop::Cancelled => {
            "The consistency sweep was cancelled before it finished; it suggests no score changes."
                .to_owned()
        }
        Stop::Failed(error) => {
            format!("The consistency sweep failed ({error}); it suggests no score changes.")
        }
    });
}

/// Asks the sweep questions and gathers the students the AI flags, each
/// student once and only those with a grade in `results`.
async fn collect_flags(
    session: &mut Session<'_>,
    job: &Job<'_>,
    students: &[StudentWork],
    results: &[StudentResult],
    chunk_map: &BTreeMap<usize, usize>,
    kind: SweepKind,
) -> Result<Vec<Flag>, Stop> {
    let questions: Vec<(Option<ScoreBand>, String)> = match kind {
        SweepKind::Compact => vec![(
            None,
            build_compact_sweep_prompt(
                results,
                students,
                &job.anchors,
                chunk_map,
                job.max_score,
                job.rubric,
            ),
        )],
        SweepKind::Pairwise => {
            build_pairwise_sweep_prompts(results, students, &job.anchors, job.max_score, job.rubric)
                .into_iter()
                .map(|band| (Some(band.band), band.prompt))
                .collect()
        }
    };

    let mut flags: Vec<Flag> = Vec::new();
    for (band, prompt) in questions {
        let check = match band {
            Some(band) => format!("Consistency sweep ({} band)", band.label()),
            None => "Consistency sweep".to_owned(),
        };
        let reply = session.ask(prompt).await?;
        let Some(items) = parse_sweep_adjustments(&reply) else {
            session.warn(format!(
                "{check}: the AI's reply held no readable list of adjustments, so this check found nothing. The reply began: {}",
                snippet(&reply)
            ));
            continue;
        };

        for item in items.iter().filter(|item| suggests_a_change(item)) {
            let index = item.get("studentIndex").and_then(as_index);
            let known = index.filter(|&index| {
                students.iter().any(|s| s.index == index)
                    && results.iter().any(|r| r.student_index == index)
            });
            let Some(student_index) = known else {
                session.warn(format!(
                    "{check}: ignored a suggestion for student {}, who has no grade in this batch.",
                    item.get("studentIndex").unwrap_or(&Value::Null)
                ));
                continue;
            };
            if flags.iter().any(|flag| flag.student_index == student_index) {
                continue;
            }
            let text = |key: &str| item.get(key).and_then(Value::as_str).map(str::to_owned);
            flags.push(Flag {
                student_index,
                band,
                suggested: item.get("suggestedScore").cloned().unwrap_or(Value::Null),
                feedback: text("suggestedFeedback"),
                reason: text("reason"),
            });
        }
    }
    Ok(flags)
}

/// True for an entry that names a student and a suggested score different
/// from the current score the AI quoted. Entries that are not objects are
/// skipped.
fn suggests_a_change(item: &Value) -> bool {
    let Some(suggested) = item.get("suggestedScore") else {
        return false;
    };
    if item.get("studentIndex").is_none() {
        return false;
    }
    match (suggested, item.get("currentScore")) {
        (Value::Number(a), Some(Value::Number(b))) => a.as_f64() != b.as_f64(),
        (a, Some(b)) => a != b,
        (_, None) => true,
    }
}

/// A student index the AI wrote as a whole, non-negative number.
fn as_index(value: &Value) -> Option<usize> {
    if let Some(index) = value.as_u64() {
        return usize::try_from(index).ok();
    }
    let number = value.as_f64()?;
    (number >= 0.0 && number.fract() == 0.0 && number < usize::MAX as f64)
        .then_some(number as usize)
}

/// The sweep's suggested score, if it is a number on the rubric's scale.
fn usable_score(value: &Value, max_score: f64) -> Option<f64> {
    value
        .as_f64()
        .filter(|score| (0.0..=max_score).contains(score))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn only_entries_that_change_a_score_count() {
        assert!(suggests_a_change(
            &json!({"studentIndex": 1, "currentScore": 6, "suggestedScore": 7.5})
        ));
        assert!(suggests_a_change(
            &json!({"studentIndex": 1, "suggestedScore": 7})
        ));
        assert!(!suggests_a_change(
            &json!({"studentIndex": 1, "currentScore": 7.0, "suggestedScore": 7})
        ));
        assert!(!suggests_a_change(
            &json!({"currentScore": 6, "suggestedScore": 7})
        ));
        assert!(!suggests_a_change(
            &json!({"studentIndex": 1, "currentScore": 6})
        ));
        // Different types never compare equal, as in the grading server.
        assert!(suggests_a_change(
            &json!({"studentIndex": 1, "currentScore": 7, "suggestedScore": "7"})
        ));
        assert!(!suggests_a_change(&json!(4)));
        assert!(!suggests_a_change(&json!(null)));
    }

    #[test]
    fn indices_must_be_whole_and_non_negative() {
        assert_eq!(as_index(&json!(3)), Some(3));
        assert_eq!(as_index(&json!(3.0)), Some(3));
        assert_eq!(as_index(&json!(3.5)), None);
        assert_eq!(as_index(&json!(-1)), None);
        assert_eq!(as_index(&json!("3")), None);
        assert_eq!(as_index(&json!(null)), None);
    }

    #[test]
    fn fallback_scores_must_fit_the_scale() {
        assert_eq!(usable_score(&json!(7.5), 10.0), Some(7.5));
        assert_eq!(usable_score(&json!(0), 10.0), Some(0.0));
        assert_eq!(usable_score(&json!(11), 10.0), None);
        assert_eq!(usable_score(&json!(-1), 10.0), None);
        assert_eq!(usable_score(&json!("8"), 10.0), None);
        assert_eq!(usable_score(&json!(null), 10.0), None);
    }
}
