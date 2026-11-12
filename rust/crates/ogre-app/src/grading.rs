//! Runs the grading engine for the window and boils its outcome down to what
//! the review table shows.

use ogre_core::format_score;
use ogre_grader::{
    BatchOutcome, CancelFlag, GradeEvent, GradeOptions, GradeStatus, ScoreSource, grade_batch,
    prepare_edited_rubric, prepare_rubric,
};
use ogre_llm::HttpProvider;

use crate::settings::ProviderSettings;
use crate::worker::GradeRequest;

/// What a grading run produced, one row per student that was sent.
#[derive(Debug, Default)]
pub struct GradeReport {
    /// The rubric text the students were graded against, after the teacher's
    /// edits, any rewording for leniency and the filling in of weights.
    /// `None` when grading never started.
    pub rubric_text: Option<String>,
    pub rows: Vec<GradedRow>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

#[derive(Debug)]
pub struct GradedRow {
    /// The student's position on the page.
    pub index: usize,
    /// The grade, or why there is none. A missing grade is never a zero.
    pub outcome: Result<Grade, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Grade {
    pub score: f64,
    pub feedback_html: String,
    /// A reason for the teacher to look at this grade before accepting it.
    pub flag: Option<String>,
}

/// Grades the request's students. `progress` is called with the number of
/// students finished so far. Never fails as a whole: a run that could not
/// start reports every student as not graded, with the reason.
pub async fn grade(
    request: GradeRequest,
    cancel: &CancelFlag,
    mut progress: impl FnMut(usize) + Send,
) -> GradeReport {
    let indices: Vec<usize> = request.students.iter().map(|s| s.index).collect();
    let nobody_graded = |reason: String| GradeReport {
        rubric_text: None,
        rows: indices
            .iter()
            .map(|&index| GradedRow {
                index,
                outcome: Err(reason.clone()),
            })
            .collect(),
        warnings: vec![reason.clone()],
        cancelled: false,
    };

    let config = request.provider.to_config(request.api_key.as_deref());
    let provider = match HttpProvider::new(config) {
        Ok(provider) => provider,
        Err(error) => return nobody_graded(format!("The AI service could not be set up: {error}")),
    };

    let mut done = 0;
    let mut on_event = |event: GradeEvent| {
        if matches!(event, GradeEvent::Student(_)) {
            done += 1;
            progress(done);
        }
    };
    // What the page gave is first shaped the way the teacher's settings ask:
    // reworded for leniency, with category weights filled in. The teacher's
    // own instructions ride along unchanged.
    let prepared = match &request.rubric_text {
        Some(text) => {
            prepare_edited_rubric(&provider, &request.rubric, text, request.leniency).await
        }
        None => prepare_rubric(&provider, &request.rubric, request.leniency).await,
    };
    let mut rubric = prepared.rubric;
    rubric.custom_instructions = request.rubric.custom_instructions.clone();

    let options = GradeOptions {
        score_source: if request.score_from_verdicts {
            ScoreSource::Verdicts
        } else {
            ScoreSource::Ai
        },
        ..GradeOptions::default()
    };
    let outcome = grade_batch(
        &provider,
        &rubric,
        request.students,
        &options,
        cancel,
        &mut on_event,
    )
    .await;
    match outcome {
        Ok(outcome) => {
            let mut report = report(outcome);
            report.rubric_text = Some(prepared.text);
            if let Some(problem) = prepared.rewrite_problem {
                report.warnings.insert(
                    0,
                    format!(
                        "The rubric could not be reworded for your leniency setting, \
                         so it was used as written: {problem}"
                    ),
                );
            }
            report
        }
        Err(error) => nobody_graded(format!("Grading could not start: {error}")),
    }
}

fn report(outcome: BatchOutcome) -> GradeReport {
    let mut rows: Vec<GradedRow> = outcome
        .students
        .iter()
        .map(|student| GradedRow {
            index: student.student_index,
            outcome: match &student.status {
                GradeStatus::Graded(grade) => Ok(Grade {
                    score: grade.score,
                    feedback_html: grade.feedback.clone(),
                    flag: None,
                }),
                GradeStatus::NotGraded(reason) => Err(reason.to_string()),
            },
        })
        .collect();

    let mut flag = |index: usize, text: String| {
        let grade = rows
            .iter_mut()
            .find(|row| row.index == index)
            .and_then(|row| row.outcome.as_mut().ok());
        if let Some(grade) = grade {
            grade.flag = Some(match grade.flag.take() {
                Some(earlier) => format!("{earlier} {text}"),
                None => text,
            });
        }
    };
    for outlier in &outcome.outliers.outliers {
        flag(
            outlier.student_index,
            "This score stands apart from the rest of the class.".into(),
        );
    }
    // The consistency check only suggests; the teacher decides.
    for adjustment in &outcome.sweep.adjustments {
        let reason = adjustment
            .reason
            .as_deref()
            .map(|reason| format!(": {reason}"))
            .unwrap_or_default();
        flag(
            adjustment.student_index,
            format!(
                "A consistency check suggests {} instead{reason}",
                format_score(adjustment.suggested_score)
            ),
        );
    }

    GradeReport {
        rubric_text: None,
        rows,
        warnings: outcome.warnings,
        cancelled: outcome.cancelled,
    }
}

/// The AI service described by `settings`, ready to be asked.
pub fn provider(
    settings: &ProviderSettings,
    api_key: Option<&str>,
) -> Result<HttpProvider, String> {
    if let Some(problem) = settings.problem(api_key.is_some_and(|key| !key.trim().is_empty())) {
        return Err(problem.to_owned());
    }
    HttpProvider::new(settings.to_config(api_key))
        .map_err(|error| format!("The AI service could not be set up: {error}"))
}

/// The models the service offers.
pub async fn list_models(
    provider: &ProviderSettings,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    // Listing needs no model; the config type does.
    let mut config = provider.to_config(api_key);
    if config.model.is_empty() {
        config.model = "unused".into();
    }
    let provider = HttpProvider::new(config).map_err(|error| error.to_string())?;
    provider.list_models().await.map_err(|error| match error {
        ogre_llm::LlmError::Unsupported(_) => {
            "This service does not list its models. Type the model's name.".to_owned()
        }
        other => other.to_string(),
    })
}
