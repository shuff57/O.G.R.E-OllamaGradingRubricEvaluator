//! What grading produces: per-student outcomes, the events sent while it
//! runs, and the final reports.

use std::fmt;
use std::time::Duration;

use ogre_core::{OutlierReport, ScoreBand, ScoringAnchors, StudentResult};
use ogre_llm::LlmError;

use crate::options::SweepKind;

/// One student's place in a batch: a grade, or the reason there is none.
#[derive(Debug, Clone, PartialEq)]
pub struct StudentOutcome {
    pub student_index: usize,
    pub name: String,
    pub status: GradeStatus,
}

impl StudentOutcome {
    pub fn grade(&self) -> Option<&Grade> {
        match &self.status {
            GradeStatus::Graded(grade) => Some(grade),
            GradeStatus::NotGraded(_) => None,
        }
    }

    pub fn is_graded(&self) -> bool {
        self.grade().is_some()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum GradeStatus {
    Graded(Grade),
    /// No score exists for this student. This is not a zero.
    NotGraded(NotGradedReason),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Grade {
    /// On the rubric's own scale.
    pub score: f64,
    pub feedback: String,
    pub source: GradeSource,
    /// The first-pass grade, when the outlier review replaced it.
    pub revised_from: Option<PriorGrade>,
}

/// Where a grade came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradeSource {
    Ai,
    /// The student submitted nothing, as did everyone else in the chunk, so
    /// the AI was not asked: the score is zero with stock feedback.
    NoResponse,
}

/// A grade the outlier review replaced.
#[derive(Debug, Clone, PartialEq)]
pub struct PriorGrade {
    pub score: f64,
    pub feedback: String,
    /// How far the score was from the class mean, in standard deviations.
    pub deviation: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum NotGradedReason {
    /// The reply for the student's chunk could not be read.
    UnreadableReply,
    /// The AI wrote a result for the student but gave it no usable score.
    NoScore,
    /// The reply held fewer results than students, and asking once more for
    /// the missing ones did not produce this student's.
    SkippedByAi,
    /// The request failed, or was not sent because an earlier one failed in
    /// a way that would repeat.
    ProviderError(LlmError),
    /// Grading was cancelled before the student's request was sent.
    Cancelled,
}

impl fmt::Display for NotGradedReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnreadableReply => f.write_str("the AI's reply could not be read"),
            Self::NoScore => f.write_str("the AI gave no score for this student"),
            Self::SkippedByAi => f.write_str("the AI returned no result for this student"),
            Self::ProviderError(error) => write!(f, "the AI request failed: {error}"),
            Self::Cancelled => f.write_str("grading was cancelled first"),
        }
    }
}

/// A score change the consistency sweep proposes. Nothing has been changed:
/// the teacher accepts or dismisses each one.
#[derive(Debug, Clone, PartialEq)]
pub struct SweepAdjustment {
    pub student_index: usize,
    pub name: String,
    /// The score band the student was compared within. `None` for the
    /// compact sweep.
    pub band: Option<ScoreBand>,
    pub original_score: f64,
    pub original_feedback: String,
    pub suggested_score: f64,
    pub suggested_feedback: Option<String>,
    /// The sweep's explanation for flagging the student.
    pub reason: Option<String>,
    /// True when the suggestion comes from re-grading the student with the
    /// full grading prompt, false when the re-grade gave nothing usable and
    /// this is the sweep's own, briefer suggestion.
    pub regraded: bool,
}

/// The result of the consistency sweep.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SweepOutcome {
    /// The sweep that ran, or `None` if it was off or the batch too small.
    pub kind: Option<SweepKind>,
    pub adjustments: Vec<SweepAdjustment>,
}

/// The totals sent with [`GradeEvent::Done`].
#[derive(Debug, Clone, PartialEq)]
pub struct Summary {
    /// Mean and standard deviation of the graded scores, before any outlier
    /// review.
    pub mean: f64,
    pub std_dev: f64,
    /// Scores more than two standard deviations from the mean.
    pub outliers: usize,
    /// Sweep suggestions waiting for the teacher.
    pub review_pending: usize,
    pub anchors: ScoringAnchors,
    pub total_students: usize,
    pub graded: usize,
    pub chunks: usize,
    pub sweep: Option<SweepKind>,
    pub elapsed: Duration,
    pub cancelled: bool,
}

/// Progress reported while grading runs, in the order things happen.
#[derive(Debug, Clone, PartialEq)]
pub enum GradeEvent {
    /// A chunk is about to be sent. Chunk indices count from zero.
    ChunkStarted {
        chunk_index: usize,
        total_chunks: usize,
        student_count: usize,
        total_students: usize,
    },
    /// A request has been pending for `elapsed`.
    Heartbeat {
        elapsed: Duration,
    },
    /// One student's outcome. Sent for every student of a chunk, in the
    /// chunk's order, before its [`GradeEvent::ChunkFinished`].
    Student(StudentOutcome),
    ChunkFinished {
        chunk_index: usize,
        graded: usize,
        not_graded: usize,
    },
    SweepStarted {
        kind: SweepKind,
    },
    /// The students the sweep flagged are being re-graded for full feedback.
    SweepRegrade {
        count: usize,
    },
    /// The sweep's suggestions, for the teacher to accept or dismiss.
    Review {
        adjustments: Vec<SweepAdjustment>,
    },
    OutlierReviewStarted {
        outlier_count: usize,
    },
    /// Students whose grade the outlier review replaced, with the grade it
    /// replaced in [`Grade::revised_from`].
    OutliersAdjusted {
        students: Vec<StudentOutcome>,
    },
    /// Something the teacher should know about. Also collected in the
    /// returned report.
    Warning(String),
    /// Always the last event.
    Done(Summary),
}

/// Everything a batch produced.
#[derive(Debug, Clone, PartialEq)]
pub struct BatchOutcome {
    /// One entry per student, in the order they were given.
    pub students: Vec<StudentOutcome>,
    pub anchors: ScoringAnchors,
    /// Statistics over the graded scores as first graded, before any outlier
    /// review.
    pub outliers: OutlierReport,
    pub sweep: SweepOutcome,
    pub warnings: Vec<String>,
    /// True when grading stopped early because it was cancelled.
    pub cancelled: bool,
    pub chunks: usize,
    pub elapsed: Duration,
}

impl BatchOutcome {
    /// The graded students as plain results, in the order they were given.
    pub fn results(&self) -> Vec<StudentResult> {
        self.students
            .iter()
            .filter_map(|student| {
                let grade = student.grade()?;
                Some(StudentResult {
                    student_index: student.student_index,
                    score: grade.score,
                    feedback: grade.feedback.clone(),
                })
            })
            .collect()
    }

    pub fn not_graded(&self) -> impl Iterator<Item = &StudentOutcome> {
        self.students.iter().filter(|student| !student.is_graded())
    }
}

/// What re-running the consistency sweep on existing grades produced.
#[derive(Debug, Clone, PartialEq)]
pub struct SweepReport {
    pub sweep: SweepOutcome,
    pub anchors: ScoringAnchors,
    /// Statistics over the grades that were passed in.
    pub outliers: OutlierReport,
    pub warnings: Vec<String>,
    pub cancelled: bool,
    pub elapsed: Duration,
}
