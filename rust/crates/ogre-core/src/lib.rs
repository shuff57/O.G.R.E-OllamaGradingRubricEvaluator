//! Grading types and logic shared by every OGRE front end.
//!
//! This crate does no I/O and must keep compiling for `wasm32-unknown-unknown`.

pub mod grading;
mod submission;
mod write;

pub use grading::{
    Anchor, BandPrompt, BatchStats, BridgeResponse, CalibrationExample, CalibrationExamples,
    CategoryWeighting, CheckedResult, ChecklistItem, Chunk, DEFAULT_CHUNK_SIZE,
    DEFAULT_PROMPT_CHUNK_SIZE, GRADING_PHILOSOPHY, GradingConstants, GradingError, MaxScore,
    OrderedMap, Outlier, OutlierReport, OutlierStudent, PARSE_ERROR_FEEDBACK, PeerResult, Rubric,
    RubricItem, SCORING_SCALE_DESCRIPTORS, ScaleDescriptor, ScoreBand, ScoringAnchors, SingleGrade,
    StudentResult, StudentWork, WeightMap, WeightMode, build_batch_prompt,
    build_compact_sweep_prompt, build_outlier_review_prompt, build_pairwise_sweep_prompts,
    build_single_grade_prompt, chunk_students, chunk_students_by_prompt, detect_outliers,
    extract_first_name, feedback_names_specific_deficiency, generate_scoring_anchors,
    merge_results, parse_batch_response, parse_batch_response_checked, parse_single_grade_response,
    reconcile_score_with_feedback,
};
pub use submission::{FeedbackField, FeedbackKind, GradingPage, Position, ScoreField, Submission};
pub use write::{
    FeedbackWrite, GradeWrite, ScoreWrite, SkipReason, WritePolicy, format_score, plan_write,
};
