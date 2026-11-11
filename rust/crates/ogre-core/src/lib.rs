//! Grading types and logic shared by every OGRE front end.
//!
//! This crate does no I/O and must keep compiling for `wasm32-unknown-unknown`.

pub mod grading;
pub mod rubric;
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
pub use rubric::{
    DEFAULT_WEIGHT_MODE, RowType, RubricCriterion, WeightValidation, auto_fill_weights,
    criteria_to_text, equalize_weights, extract_model_text, full_credit_points,
    has_unsaved_changes, is_allocation_criterion, prepare_for_grading, rubric_from_text,
    rubric_text, text_to_criteria, validate_weights, with_default_weights,
};
pub use rubric::{
    NEUTRAL_LENIENCY, RewriteError, accept_rewrite, leniency_rewrite_prompt,
    restore_category_weights,
};
pub use submission::{FeedbackField, FeedbackKind, GradingPage, Position, ScoreField, Submission};
pub use write::{
    FeedbackWrite, GradeWrite, ScoreWrite, SkipReason, WritePolicy, format_score, plan_write,
};
