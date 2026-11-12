use ogre_core::{ExtractionError, GradingError};
use ogre_llm::LlmError;

/// Why a grading call produced nothing at all. Problems with part of a batch
/// are not errors: they are reported per student and as warnings.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum GraderError {
    #[error("there are no students to grade")]
    NoStudents,

    /// Results are matched back to students by index, so two students cannot
    /// share one.
    #[error("student index {0} appears more than once")]
    DuplicateStudentIndex(usize),

    #[error("the rubric cannot be used: {0}")]
    Rubric(#[from] GradingError),

    #[error(transparent)]
    Provider(#[from] LlmError),

    /// The AI was shown a picture and gave back no rubric.
    #[error(transparent)]
    NoRubricRead(#[from] ExtractionError),

    /// The AI answered, but not with anything that reads as a grade.
    #[error("the AI's reply could not be read as a grade: {reply}")]
    UnreadableReply {
        /// The start of the reply, for the teacher to see what came back.
        reply: String,
    },
}
