//! Runs the grading engine for the window and boils its outcome down to what
//! the review table shows.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use ogre_agent::{Skill, build_skill_injection};
use ogre_core::{ExtractedRubric, Rubric, StudentResult, imported_rubric_text};
use ogre_grader::{
    BatchOutcome, CancelFlag, GradeEvent, GradeOptions, GradeStatus, GraderError,
    MIN_SWEEP_STUDENTS, PreparedRubric, ScoreSource, StudentOutcome, draft_rubric as draft,
    generate_anchor_examples, grade_batch, prepare_edited_rubric, prepare_rubric,
    read_rubric_from_image, sweep_grades,
};
use ogre_llm::{HttpProvider, Image};

use crate::settings::ProviderSettings;
use crate::worker::{ExamplesRequest, GradeRequest, OutsideRubric};

/// The heading the grader's prompt knows scoring examples by.
const EXAMPLES_HEADING: &str = "SCORING CALIBRATION:";

/// The scoring examples, the teacher's instructions and their skills, as
/// one text for the grader's prompt.
///
/// The examples lead, as the Electron app's anchors do: the prompt takes
/// them for examples to calibrate by only at the start of the text. Anywhere
/// else they would be read as more instructions the AI must follow. The
/// skills come last, each between the lines the Electron app marks one with.
fn grader_instructions(
    instructions: Option<&str>,
    examples: Option<&str>,
    skills: &[Skill],
) -> Option<String> {
    let examples = examples
        .map(str::trim)
        .filter(|examples| !examples.is_empty())
        .map(|examples| format!("{EXAMPLES_HEADING}\n{examples}"));
    let skills = build_skill_injection(skills);
    let parts: Vec<&str> = examples
        .as_deref()
        .into_iter()
        .chain(instructions)
        .chain(Some(skills.trim()).filter(|skills| !skills.is_empty()))
        .collect();
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

/// Everything a rubric's preparation depends on.
#[derive(Debug, Clone, PartialEq)]
struct Basis {
    rubric: Rubric,
    rubric_text: Option<String>,
    leniency: i16,
    provider: ProviderSettings,
}

/// The rubric as it was last prepared for grading. Rewording a rubric for
/// leniency is the AI's work and comes out differently each time, so the
/// result is kept: scoring examples and the grading that follows them, and a
/// second grading run, all use one wording.
#[derive(Debug, Default)]
pub struct PreparedCache(Option<(Basis, PreparedRubric)>);

impl PreparedCache {
    async fn prepare(
        &mut self,
        provider: &HttpProvider,
        rubric: &Rubric,
        rubric_text: Option<&str>,
        leniency: i16,
        settings: &ProviderSettings,
    ) -> PreparedRubric {
        let basis = Basis {
            // The teacher's instructions take no part in the preparation.
            rubric: Rubric {
                custom_instructions: None,
                ..rubric.clone()
            },
            rubric_text: rubric_text.map(str::to_owned),
            leniency,
            provider: settings.clone(),
        };
        if let Some((kept, prepared)) = &self.0
            && *kept == basis
        {
            return prepared.clone();
        }
        // What the page gave is shaped the way the teacher's settings ask:
        // reworded for leniency, with category weights filled in.
        let prepared = match rubric_text {
            Some(text) => prepare_edited_rubric(provider, rubric, text, leniency).await,
            None => prepare_rubric(provider, rubric, leniency).await,
        };
        // A rewording that failed is tried again next time.
        self.0 = prepared
            .rewrite_problem
            .is_none()
            .then(|| (basis, prepared.clone()));
        prepared
    }
}

/// What a grading run produced, one row per student that was sent.
#[derive(Debug, Default)]
pub struct GradeReport {
    /// The rubric text the students were graded against, after the teacher's
    /// edits, any rewording for leniency and the filling in of weights.
    /// `None` when grading never started.
    pub rubric_text: Option<String>,
    /// The scoring examples the grader was shown, if any.
    pub examples: Option<String>,
    /// The teacher's skills the grader was given, by name.
    pub skills: Vec<String>,
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
    /// A different grade the consistency check proposes. Never applied
    /// unless the teacher takes it.
    pub suggestion: Option<Suggestion>,
}

/// What the consistency check would give a student instead.
#[derive(Debug, Clone, PartialEq)]
pub struct Suggestion {
    pub score: f64,
    /// Feedback rewritten to go with the score, where the check wrote any.
    pub feedback_html: Option<String>,
    /// Why the check thinks the first score is out of line.
    pub reason: Option<String>,
}

/// Grades the request's students. `progress` is called as each student is
/// finished, with how many are and that student's grade as it then stands:
/// the consistency check, which comes last, has not looked at it yet. Never fails as a whole: a run that could not
/// start reports every student as not graded, with the reason.
pub async fn grade(
    request: GradeRequest,
    skills: &[Skill],
    cancel: &CancelFlag,
    cache: &mut PreparedCache,
    mut progress: impl FnMut(usize, GradedRow) + Send,
) -> GradeReport {
    let indices: Vec<usize> = request.students.iter().map(|s| s.index).collect();
    let nobody_graded = |reason: String| GradeReport {
        rubric_text: None,
        examples: None,
        skills: Vec::new(),
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
        if let GradeEvent::Student(student) = &event {
            done += 1;
            progress(done, graded_row(student));
        }
    };
    let ready = Ready::make(&provider, &request, skills, cache).await;
    let outcome = grade_batch(
        &provider,
        &ready.rubric,
        request.students,
        &ready.options,
        cancel,
        &mut on_event,
    )
    .await;
    match outcome {
        Ok(outcome) => {
            let mut report = report(outcome);
            report.rubric_text = Some(ready.text);
            report.examples = ready.examples;
            report.skills = skills.iter().map(|skill| skill.name.clone()).collect();
            if let Some(problem) = ready.rewrite_problem {
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

/// A request's rubric as the grader is given it, and how to grade with it.
struct Ready {
    /// Prepared, with the scoring examples, the teacher's instructions and
    /// their skills in its instructions.
    rubric: Rubric,
    options: GradeOptions,
    /// The prepared rubric text, for the record.
    text: String,
    rewrite_problem: Option<String>,
    /// The scoring examples the grader is shown, if any.
    examples: Option<String>,
}

impl Ready {
    async fn make(
        provider: &HttpProvider,
        request: &GradeRequest,
        skills: &[Skill],
        cache: &mut PreparedCache,
    ) -> Self {
        let prepared = cache
            .prepare(
                provider,
                &request.rubric,
                request.rubric_text.as_deref(),
                request.leniency,
                &request.provider,
            )
            .await;
        let mut rubric = prepared.rubric;
        let examples = request
            .examples
            .as_deref()
            .map(str::trim)
            .filter(|examples| !examples.is_empty());
        rubric.custom_instructions = grader_instructions(
            request.rubric.custom_instructions.as_deref(),
            examples,
            skills,
        );
        Self {
            rubric,
            options: GradeOptions {
                score_source: if request.score_from_verdicts {
                    ScoreSource::Verdicts
                } else {
                    ScoreSource::Ai
                },
                // Weights the rubric text names are meant to count.
                weights_by_name: prepared.weights_given,
                ..GradeOptions::default()
            },
            text: prepared.text,
            rewrite_problem: prepared.rewrite_problem,
            examples: examples.map(str::to_owned),
        }
    }
}

/// Runs the consistency check on grades that are already in the table,
/// without grading anyone again. `request` is what a grading run would be
/// given, with the students whose grades are checked; `grades` are those
/// grades as they now stand. Gives the suggestions, by the student's place
/// on the page. Nothing is changed.
pub async fn sweep(
    request: GradeRequest,
    grades: Vec<StudentResult>,
    skills: &[Skill],
    cancel: &CancelFlag,
    cache: &mut PreparedCache,
) -> Result<Vec<(usize, Suggestion)>, String> {
    if grades.len() < MIN_SWEEP_STUDENTS {
        return Err(format!(
            "The consistency check compares students with each other, and needs at least \
             {MIN_SWEEP_STUDENTS} grades to do it."
        ));
    }
    let provider = provider(&request.provider, request.api_key.as_deref())?;
    let ready = Ready::make(&provider, &request, skills, cache).await;
    let mut ignore = |_: GradeEvent| {};
    let report = sweep_grades(
        &provider,
        &ready.rubric,
        &request.students,
        &grades,
        &ready.options,
        cancel,
        &mut ignore,
    )
    .await
    .map_err(|error| format!("The consistency check could not run: {error}"))?;
    if report.cancelled {
        return Err("The consistency check was stopped before it finished.".to_owned());
    }
    if let Some(problem) = report.warnings.first() {
        return Err(format!("The consistency check did not finish: {problem}"));
    }
    Ok(report
        .sweep
        .adjustments
        .into_iter()
        .map(|adjustment| {
            (
                adjustment.student_index,
                Suggestion {
                    score: adjustment.suggested_score,
                    feedback_html: adjustment.suggested_feedback,
                    reason: adjustment.reason,
                },
            )
        })
        .collect())
}

/// One student's outcome as a row of the review table.
fn graded_row(student: &StudentOutcome) -> GradedRow {
    GradedRow {
        index: student.student_index,
        outcome: match &student.status {
            GradeStatus::Graded(grade) => Ok(Grade {
                score: grade.score,
                feedback_html: grade.feedback.clone(),
                flag: None,
                suggestion: None,
            }),
            GradeStatus::NotGraded(reason) => Err(reason.to_string()),
        },
    }
}

fn report(outcome: BatchOutcome) -> GradeReport {
    let mut rows: Vec<GradedRow> = outcome.students.iter().map(graded_row).collect();

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
        let grade = rows
            .iter_mut()
            .find(|row| row.index == adjustment.student_index)
            .and_then(|row| row.outcome.as_mut().ok());
        if let Some(grade) = grade {
            grade.suggestion = Some(Suggestion {
                score: adjustment.suggested_score,
                feedback_html: adjustment.suggested_feedback.clone(),
                reason: adjustment.reason.clone(),
            });
        }
    }

    GradeReport {
        rubric_text: None,
        examples: None,
        skills: Vec::new(),
        rows,
        warnings: outcome.warnings,
        cancelled: outcome.cancelled,
    }
}

/// Has the AI reword the request's rubric for its leniency, and gives the
/// wording as requirements for the teacher's editor. The wording is kept,
/// so a grading run at the same leniency would use this one.
pub async fn reword_rubric(
    request: ExamplesRequest,
    cache: &mut PreparedCache,
) -> Result<String, String> {
    let provider = provider(&request.provider, request.api_key.as_deref())?;
    let prepared = cache
        .prepare(
            &provider,
            &request.rubric,
            request.rubric_text.as_deref(),
            request.leniency,
            &request.provider,
        )
        .await;
    match prepared.rewrite_problem {
        Some(problem) => Err(format!("The rubric could not be reworded: {problem}")),
        None => Ok(ogre_core::editable_requirements(
            &prepared.text,
            prepared.weights_given,
        )),
    }
}

/// Has the AI write an example answer at each of four levels for the
/// request's rubric, as text for the teacher to read and edit.
pub async fn write_examples(
    request: ExamplesRequest,
    cache: &mut PreparedCache,
) -> Result<String, String> {
    let provider = provider(&request.provider, request.api_key.as_deref())?;
    let prepared = cache
        .prepare(
            &provider,
            &request.rubric,
            request.rubric_text.as_deref(),
            request.leniency,
            &request.provider,
        )
        .await;
    let examples = generate_anchor_examples(
        &provider,
        &prepared.rubric,
        Some(f64::from(request.leniency)),
    )
    .await
    .map_err(|error| format!("The scoring examples could not be written: {error}"))?;
    let text = examples
        .iter()
        .filter(|example| !example.response.is_empty())
        .map(|example| format!("{}: {}", example.label, example.response))
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Err(
            "The AI's reply did not hold the examples that were asked for. Try again.".to_owned(),
        );
    }
    Ok(text)
}

/// Has the AI read the rubric that a screenshot of the page shows, as text
/// for the rubric editor.
pub async fn rubric_from_picture(
    settings: &ProviderSettings,
    api_key: Option<&str>,
    png: &[u8],
) -> Result<OutsideRubric, String> {
    let provider = provider(settings, api_key)?;
    let picture = Image::new("image/png", BASE64.encode(png));
    match read_rubric_from_image(&provider, picture).await {
        Ok(rubric) => Ok(outside(rubric)),
        Err(GraderError::NoRubricRead(_)) => Err(
            "The AI found no rubric in the picture of the page. Scroll the rubric into view \
             in Chrome and try again."
                .to_owned(),
        ),
        Err(error) => Err(format!(
            "The picture of the page could not be read: {error} The model has to be one \
             that can look at pictures."
        )),
    }
}

/// Has the AI write a rubric for `question`, worth `max_score` points, as
/// text for the rubric editor.
pub async fn draft_rubric(
    settings: &ProviderSettings,
    api_key: Option<&str>,
    question: &str,
    max_score: f64,
) -> Result<OutsideRubric, String> {
    let provider = provider(settings, api_key)?;
    match draft(&provider, question, max_score).await {
        Ok(rubric) => Ok(outside(rubric)),
        Err(GraderError::NoRubricRead(_)) => Err(
            "The AI wrote no rubric for this question. Try again, or type the requirements \
             yourself."
                .to_owned(),
        ),
        Err(error) => Err(format!("The rubric could not be drafted: {error}")),
    }
}

fn outside(rubric: ExtractedRubric) -> OutsideRubric {
    OutsideRubric {
        requirements: imported_rubric_text(&rubric.criteria),
        parts: rubric.criteria.len(),
        name: rubric.suggested_name,
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

#[cfg(test)]
mod tests {
    use ogre_core::{StudentWork, build_batch_prompt, generate_scoring_anchors};

    use super::*;

    /// The prompt a class is graded with, given what the teacher set up.
    fn prompt(instructions: Option<&str>, examples: Option<&str>) -> String {
        prompt_with_skills(instructions, examples, &[])
    }

    fn prompt_with_skills(
        instructions: Option<&str>,
        examples: Option<&str>,
        skills: &[Skill],
    ) -> String {
        let rubric = Rubric {
            max_score: Some(ogre_core::MaxScore::Number(10.0)),
            custom_instructions: grader_instructions(instructions, examples, skills),
            ..Rubric::default()
        };
        let student = StudentWork {
            index: 0,
            name: "Student 1".into(),
            response: "An answer.".into(),
            prompt: None,
        };
        let anchors = generate_scoring_anchors(&rubric);
        build_batch_prompt(&rubric, &[student], &anchors, None, None).unwrap()
    }

    /// The part of `prompt` under the heading that starts with `heading`, up
    /// to the next blank line.
    fn under<'a>(prompt: &'a str, heading: &str) -> &'a str {
        let from = prompt
            .find(heading)
            .unwrap_or_else(|| panic!("no {heading:?} in:\n{prompt}"));
        let rest = &prompt[from..];
        let rest = &rest[rest.find('\n').map_or(rest.len(), |at| at + 1)..];
        &rest[..rest.find("\n\n").unwrap_or(rest.len())]
    }

    const MUST_FOLLOW: &str = "INSTRUCTOR OVERRIDE INSTRUCTIONS";
    const TO_CALIBRATE: &str = "SCORING CALIBRATION EXAMPLES";
    const EXAMPLES: &str =
        "Excellent: Names the theorem and its conditions.\n\nMinimal: Says it is about averages.";

    #[test]
    fn scoring_examples_calibrate_and_instructions_are_followed() {
        let prompt = prompt(Some("Accept answers given in words."), Some(EXAMPLES));
        assert_eq!(
            under(&prompt, MUST_FOLLOW),
            "Accept answers given in words."
        );
        assert!(
            under(&prompt, TO_CALIBRATE).starts_with("Excellent: Names the theorem"),
            "{prompt}"
        );
        assert!(prompt.contains("Minimal: Says it is about averages."));
    }

    #[test]
    fn either_one_goes_alone() {
        let only_examples = prompt(None, Some(EXAMPLES));
        assert!(!only_examples.contains(MUST_FOLLOW));
        assert!(under(&only_examples, TO_CALIBRATE).starts_with("Excellent:"));

        let only_instructions = prompt(Some("Accept answers given in words."), Some("  "));
        assert!(!only_instructions.contains(TO_CALIBRATE));
        assert_eq!(
            under(&only_instructions, MUST_FOLLOW),
            "Accept answers given in words."
        );

        assert_eq!(grader_instructions(None, None, &[]), None);
    }

    fn skill(name: &str, content: &str) -> Skill {
        Skill {
            name: name.to_owned(),
            content: content.to_owned(),
            ..Skill::from_markdown("skill", "", "", ogre_agent::SkillSource::Local)
        }
    }

    #[test]
    fn the_teachers_skills_are_instructions_the_grader_must_follow() {
        let skills = [
            skill("Late work", "One point off for each day late."),
            skill("Units", "An answer without units loses a point."),
        ];
        let prompt = prompt_with_skills(
            Some("Accept answers given in words."),
            Some(EXAMPLES),
            &skills,
        );
        // The examples still calibrate, and only calibrate.
        let calibration = under(&prompt, TO_CALIBRATE);
        assert!(calibration.starts_with("Excellent:"), "{prompt}");
        assert!(!prompt[prompt.find(TO_CALIBRATE).unwrap()..].contains("SKILL"));
        // The instructions come first, then each skill under its name.
        let (from, to) = (
            prompt.find(MUST_FOLLOW).unwrap(),
            prompt.find(TO_CALIBRATE).unwrap(),
        );
        assert!(from < to, "{prompt}");
        let must_follow = &prompt[from..to];
        let places: Vec<usize> = [
            "Accept answers given in words.",
            "--- SKILL: Late work ---\nOne point off for each day late.\n--- END SKILL ---",
            "--- SKILL: Units ---\nAn answer without units loses a point.\n--- END SKILL ---",
        ]
        .iter()
        .map(|part| {
            must_follow
                .find(part)
                .unwrap_or_else(|| panic!("no {part:?} in:\n{must_follow}"))
        })
        .collect();
        assert!(places.is_sorted(), "{places:?}");

        // Skills alone are instructions too.
        let alone = prompt_with_skills(None, None, &skills[..1]);
        assert!(
            under(&alone, MUST_FOLLOW).starts_with("--- SKILL: Late work ---"),
            "{alone}"
        );
    }
}
