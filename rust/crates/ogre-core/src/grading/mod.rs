//! Pure grading logic: prompt building, AI response parsing, score
//! reconciliation and batch statistics.
//!
//! This is a port of the JavaScript grading server's `grading.js`. Prompts
//! are byte-identical to the original and the parsers accept the same
//! malformed AI output, so the private `js` module reproduces the JavaScript
//! number and string behaviour both depend on. Calling the AI is the caller's
//! job.

mod batch;
mod constants;
mod feedback;
pub(crate) mod js;
mod parse;
mod prompts;
mod types;

#[cfg(test)]
mod tests;

use regex::Regex;

pub use batch::{
    DEFAULT_CHUNK_SIZE, DEFAULT_PROMPT_CHUNK_SIZE, chunk_students, chunk_students_by_prompt,
    detect_outliers, merge_results,
};
pub use constants::{GRADING_PHILOSOPHY, SCORING_SCALE_DESCRIPTORS};
pub use feedback::{
    extract_first_name, feedback_names_specific_deficiency, reconcile_score_with_feedback,
};
pub use parse::{
    CheckedResult, PARSE_ERROR_FEEDBACK, parse_batch_response, parse_batch_response_checked,
    parse_single_grade_response,
};
pub use prompts::{
    build_batch_prompt, build_compact_sweep_prompt, build_outlier_review_prompt,
    build_pairwise_sweep_prompts, build_single_grade_prompt, generate_scoring_anchors,
};
pub use types::{
    Anchor, BandPrompt, BatchStats, BridgeResponse, CalibrationExample, CalibrationExamples,
    CategoryWeighting, ChecklistItem, Chunk, GradingConstants, GradingError, MaxScore, OrderedMap,
    Outlier, OutlierReport, OutlierStudent, PeerResult, Rubric, RubricItem, ScaleDescriptor,
    ScoreBand, ScoringAnchors, SingleGrade, StudentResult, StudentWork, WeightMap, WeightMode,
};

/// A decimal number as the original's `/-?\d+(?:\.\d+)?/` matches it.
const NUMBER: &str = r"-?[0-9]+(?:\.[0-9]+)?";

/// Compiles one of this module's own patterns.
fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("built-in pattern is valid")
}
