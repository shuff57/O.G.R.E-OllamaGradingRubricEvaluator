//! Grading orchestration: sends a class's answers to an AI and collects the
//! scores.
//!
//! This is a port of the `/api/grade`, `/api/sweep`, `/api/generate-anchors`
//! and grader-mode `/api/chat` handlers of the JavaScript grading server. The
//! prompts and parsers live in `ogre-core`; this crate decides what to send,
//! in which order, and what to do when a reply is missing or unreadable.
//!
//! Nothing here writes a grade anywhere. Every function returns its results
//! to the caller, and a student the AI did not grade is reported as
//! [`GradeStatus::NotGraded`], never as a score of zero.

mod anchors;
mod batch;
mod bridge;
mod error;
mod options;
mod outcome;
mod outlier;
mod rubric;
mod session;
mod single;
mod sweep;
mod text;

pub use anchors::{
    AnchorExample, build_anchor_generation_prompt, calibration_instructions,
    generate_anchor_examples, parse_anchor_responses,
};
pub use batch::{blank_response_feedback, grade_batch};
pub use bridge::build_bridge_responses;
pub use error::GraderError;
pub use options::{
    CancelFlag, GradeOptions, MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, MIN_SWEEP_STUDENTS, ScoreSource,
    SweepKind, SweepMode,
};
pub use outcome::{
    BatchOutcome, Grade, GradeEvent, GradeSource, GradeStatus, NotGradedReason, PriorGrade,
    StudentOutcome, Summary, SweepAdjustment, SweepOutcome, SweepReport,
};
pub use rubric::{
    PreparedRubric, prepare_edited_rubric, prepare_rubric, read_rubric_from_image, rewrites_rubric,
};
pub use single::grade_single;
pub use sweep::{parse_sweep_adjustments, sweep_grades};
