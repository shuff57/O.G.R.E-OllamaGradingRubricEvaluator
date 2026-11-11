//! The outlier review: a second opinion on scores far from the class mean.
//!
//! The grading server ran this after every batch until it was replaced by
//! the consistency sweep's review suggestions. It is kept as an option, off
//! by default, and ported from the server's last version of it.

use ogre_core::{
    BatchStats, OutlierReport, OutlierStudent, PeerResult, StudentResult, StudentWork,
    build_outlier_review_prompt,
};

use crate::outcome::{GradeEvent, PriorGrade};
use crate::session::{Job, Session, Stop};
use crate::text::{display_name, is_blank, plural, snippet};

/// The review may lower a score by at most this much, so that a second
/// opinion cannot pull an accurate low score far toward the mean. Raises are
/// not limited.
const MAX_DROP: f64 = 1.0;

/// A grade the review changed.
pub(crate) struct Revision {
    pub(crate) student_index: usize,
    pub(crate) score: f64,
    pub(crate) feedback: String,
    pub(crate) prior: PriorGrade,
}

/// Re-grades the outliers in `report` and returns the grades that changed.
/// Students who submitted nothing are left out: there is nothing to re-read.
/// On any failure the result is empty and the original grades stand.
pub(crate) async fn review(
    session: &mut Session<'_>,
    job: &Job<'_>,
    students: &[StudentWork],
    results: &[StudentResult],
    report: &OutlierReport,
) -> Vec<Revision> {
    let flagged: Vec<(&StudentWork, &StudentResult, f64)> = report
        .outliers
        .iter()
        .filter_map(|outlier| {
            let student = students
                .iter()
                .find(|s| s.index == outlier.student_index && !is_blank(&s.response))?;
            let result = results
                .iter()
                .find(|r| r.student_index == outlier.student_index)?;
            Some((student, result, outlier.deviation))
        })
        .collect();
    if flagged.is_empty() {
        return Vec::new();
    }
    session.emit(GradeEvent::OutlierReviewStarted {
        outlier_count: flagged.len(),
    });

    let outlier_students: Vec<OutlierStudent> = flagged
        .iter()
        .map(|(student, result, _)| OutlierStudent {
            index: student.index,
            name: display_name(Some(student), student.index),
            response: student.response.clone(),
            prompt: student.prompt.clone().filter(|p| !p.is_empty()),
            original_score: result.score,
            original_feedback: result.feedback.clone(),
        })
        .collect();
    let peers: Vec<PeerResult> = results
        .iter()
        .map(|result| PeerResult {
            student_index: result.student_index,
            score: result.score,
            response: students
                .iter()
                .find(|s| s.index == result.student_index)
                .map(|s| s.response.clone()),
        })
        .collect();
    let stats = BatchStats {
        mean: report.mean,
        std_dev: report.std_dev,
        total_students: Some(students.len()),
    };
    let prompt = build_outlier_review_prompt(
        job.rubric,
        &outlier_students,
        &job.anchors,
        &stats,
        job.max_score,
        &peers,
    );

    let reply = match session.ask(prompt).await {
        Ok(reply) => reply,
        Err(Stop::Cancelled) => {
            session.warn(
                "The outlier review was cancelled before it finished; the original scores are kept."
                    .to_owned(),
            );
            return Vec::new();
        }
        Err(Stop::Failed(error)) => {
            session.warn(format!(
                "The outlier review failed ({error}); the original scores are kept."
            ));
            return Vec::new();
        }
    };

    let reviewed: Vec<StudentWork> = flagged
        .iter()
        .map(|(student, ..)| (*student).clone())
        .collect();
    let Some(second_opinions) = job.read(&reply, &reviewed) else {
        session.warn(format!(
            "The outlier review's reply could not be read; the original scores are kept. The reply began: {}",
            snippet(&reply)
        ));
        return Vec::new();
    };
    if second_opinions.len() != flagged.len() {
        session.warn(format!(
            "The outlier review returned {} for {}. Results are matched to students in order, so its changes may be attached to the wrong students. Check the revised scores by hand.",
            plural(second_opinions.len(), "result"),
            plural(flagged.len(), "outlier"),
        ));
    }

    second_opinions
        .into_iter()
        .zip(&flagged)
        .filter_map(|(opinion, (_, original, deviation))| {
            let score = opinion.score.max(original.score - MAX_DROP);
            (score != original.score).then(|| Revision {
                student_index: original.student_index,
                score,
                feedback: opinion.feedback,
                prior: PriorGrade {
                    score: original.score,
                    feedback: original.feedback.clone(),
                    deviation: *deviation,
                },
            })
        })
        .collect()
}
