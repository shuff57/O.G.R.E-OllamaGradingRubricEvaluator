//! Deciding what may be written back to a grading page.
//!
//! Nothing here touches a page. [`plan_write`] turns one graded result into
//! the exact field changes to make, or a reason to leave the student alone.

use serde::{Deserialize, Serialize};

use crate::{FeedbackKind, Submission};

/// The changes to make for one student.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradeWrite {
    /// Position of the student on the page when it was read.
    pub index: usize,
    pub student_id: Option<String>,
    pub name: String,
    pub score: ScoreWrite,
    /// `None` leaves the feedback on the page as it is.
    pub feedback: Option<FeedbackWrite>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreWrite {
    /// The score box to change.
    pub field: String,
    /// What the box held when the page was read. A writer must refuse if the
    /// box no longer holds this: someone changed it in the meantime.
    pub expected: String,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FeedbackWrite {
    /// The feedback box to change.
    pub field: String,
    pub kind: FeedbackKind,
    /// Feedback as HTML. It comes from an AI model and has not been made safe
    /// to insert into a page.
    pub html: String,
}

/// What the teacher has allowed for this run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct WritePolicy {
    /// Replace scores that already award points. Off unless the teacher asks.
    pub overwrite_scores: bool,
    /// Replace feedback that is already on the page. Off unless the teacher asks.
    pub replace_feedback: bool,
}

/// Why a student is left untouched.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// The student already has points and overwriting was not allowed.
    HasPoints,
    /// The question has several score boxes; one score cannot be split across them.
    SeveralScoreBoxes,
    /// The page shows no score box for this student.
    NoScoreBox,
    /// The proposed score is not a number from 0 to the maximum.
    ScoreOutOfRange,
}

impl SkipReason {
    /// A sentence fragment for the teacher: "skipped: {this}".
    pub fn explain(self) -> &'static str {
        match self {
            Self::HasPoints => "already has points",
            Self::SeveralScoreBoxes => "has several score boxes; enter this one by hand",
            Self::NoScoreBox => "no score box on the page",
            Self::ScoreOutOfRange => "the proposed score is outside the allowed range",
        }
    }
}

/// Plans the write for one student, given the score and feedback to award.
///
/// Existing feedback is kept unless `policy.replace_feedback` is set; the
/// score is still written in that case.
pub fn plan_write(
    submission: &Submission,
    score: f64,
    feedback_html: &str,
    policy: WritePolicy,
) -> Result<GradeWrite, SkipReason> {
    let score_box = match submission.scores.as_slice() {
        [] => return Err(SkipReason::NoScoreBox),
        [only] => only,
        _ => return Err(SkipReason::SeveralScoreBoxes),
    };
    if submission.has_nonzero_score() && !policy.overwrite_scores {
        return Err(SkipReason::HasPoints);
    }
    let in_range =
        score.is_finite() && score >= 0.0 && score_box.max.is_none_or(|max| score <= max);
    if !in_range {
        return Err(SkipReason::ScoreOutOfRange);
    }

    let feedback = submission
        .feedback
        .as_ref()
        .filter(|_| !feedback_html.trim().is_empty())
        .filter(|_| policy.replace_feedback || !submission.has_feedback())
        .map(|field| FeedbackWrite {
            field: field.field.clone(),
            kind: field.kind,
            html: feedback_html.to_owned(),
        });

    Ok(GradeWrite {
        index: submission.index,
        student_id: submission.student_id.clone(),
        name: submission.name.clone(),
        score: ScoreWrite {
            field: score_box.field.clone(),
            expected: score_box.raw.clone(),
            value: score,
        },
        feedback,
    })
}

/// Formats a score the way a person would type it: `7`, `7.5`, `0.25`.
pub fn format_score(score: f64) -> String {
    let rounded = (score * 1000.0).round() / 1000.0;
    format!("{rounded}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{FeedbackField, ScoreField};

    fn score_box(field: &str, raw: &str, max: f64) -> ScoreField {
        ScoreField {
            field: field.into(),
            label: "Score".into(),
            raw: raw.into(),
            max: Some(max),
        }
    }

    fn submission(scores: Vec<ScoreField>, feedback: &str) -> Submission {
        Submission {
            index: 3,
            student_id: Some("1002".into()),
            name: "Brook, Kai".into(),
            scores,
            feedback: Some(FeedbackField {
                field: "fb-0-2-1002".into(),
                kind: FeedbackKind::RichText,
                text: feedback.into(),
            }),
            response: "An answer.".into(),
            prompt: None,
        }
    }

    const ALLOW_NOTHING: WritePolicy = WritePolicy {
        overwrite_scores: false,
        replace_feedback: false,
    };

    #[test]
    fn an_ungraded_student_gets_score_and_feedback() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "0", 10.0)], "");
        let write = plan_write(&s, 7.5, "<p>Good start.</p>", ALLOW_NOTHING).unwrap();
        assert_eq!(write.index, 3);
        assert_eq!(write.student_id.as_deref(), Some("1002"));
        assert_eq!(write.score.field, "ud-1002-0-2-0");
        assert_eq!(write.score.expected, "0");
        assert_eq!(write.score.value, 7.5);
        let feedback = write.feedback.unwrap();
        assert_eq!(feedback.field, "fb-0-2-1002");
        assert_eq!(feedback.html, "<p>Good start.</p>");
    }

    #[test]
    fn a_blank_score_counts_as_ungraded() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "", 10.0)], "");
        assert!(plan_write(&s, 0.0, "<p>Try again.</p>", ALLOW_NOTHING).is_ok());
    }

    #[test]
    fn existing_points_are_not_overwritten_unless_allowed() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "4", 10.0)], "");
        assert_eq!(
            plan_write(&s, 9.0, "<p>x</p>", ALLOW_NOTHING),
            Err(SkipReason::HasPoints)
        );
        let allowed = WritePolicy {
            overwrite_scores: true,
            ..ALLOW_NOTHING
        };
        assert_eq!(
            plan_write(&s, 9.0, "<p>x</p>", allowed)
                .unwrap()
                .score
                .value,
            9.0
        );
    }

    #[test]
    fn existing_feedback_is_kept_unless_allowed() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "0", 10.0)], "See me.");
        let write = plan_write(&s, 6.0, "<p>New.</p>", ALLOW_NOTHING).unwrap();
        assert_eq!(write.score.value, 6.0);
        assert_eq!(write.feedback, None);

        let allowed = WritePolicy {
            replace_feedback: true,
            ..ALLOW_NOTHING
        };
        let write = plan_write(&s, 6.0, "<p>New.</p>", allowed).unwrap();
        assert_eq!(write.feedback.unwrap().html, "<p>New.</p>");
    }

    #[test]
    fn empty_feedback_is_never_written() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "0", 10.0)], "");
        let write = plan_write(&s, 6.0, "  ", ALLOW_NOTHING).unwrap();
        assert_eq!(write.feedback, None);
    }

    #[test]
    fn several_or_no_score_boxes_are_skipped() {
        let two = submission(
            vec![
                score_box("ud-1-0-2-0", "0", 5.0),
                score_box("ud-1-0-2-1", "0", 5.0),
            ],
            "",
        );
        assert_eq!(
            plan_write(&two, 5.0, "<p>x</p>", ALLOW_NOTHING),
            Err(SkipReason::SeveralScoreBoxes)
        );
        let none = submission(vec![], "");
        assert_eq!(
            plan_write(&none, 5.0, "<p>x</p>", ALLOW_NOTHING),
            Err(SkipReason::NoScoreBox)
        );
    }

    #[test]
    fn scores_outside_the_range_are_skipped() {
        let s = submission(vec![score_box("ud-1002-0-2-0", "0", 10.0)], "");
        for bad in [-1.0, 10.5, f64::NAN, f64::INFINITY] {
            assert_eq!(
                plan_write(&s, bad, "<p>x</p>", ALLOW_NOTHING),
                Err(SkipReason::ScoreOutOfRange),
                "{bad}"
            );
        }
        assert!(plan_write(&s, 10.0, "<p>x</p>", ALLOW_NOTHING).is_ok());
    }

    #[test]
    fn scores_are_formatted_like_typed_numbers() {
        assert_eq!(format_score(7.0), "7");
        assert_eq!(format_score(7.5), "7.5");
        assert_eq!(format_score(0.25), "0.25");
        assert_eq!(format_score(2.0 / 3.0), "0.667");
        assert_eq!(format_score(0.1 + 0.2), "0.3");
    }
}
