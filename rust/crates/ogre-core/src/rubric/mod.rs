//! The rubric as the teacher sees and edits it, and the step that turns a
//! scraped rubric into the one that is graded against.
//!
//! A port of the desktop app's rubric pipeline: `lib/rubric-utils.ts`,
//! `components/grading/batch/format.ts`, and the parts of `RubricCard.svelte`
//! and `BatchProgress.svelte` that sit between scraping a page and sending
//! the grading request. The results match the original for the same input,
//! including where the original is odd, so the regular expressions follow
//! JavaScript's rules for whitespace, digits and line ends.

mod criteria;
mod leniency;
mod prepare;

#[cfg(test)]
mod tests;

pub use criteria::{
    RowType, RubricCriterion, WeightValidation, auto_fill_weights, criteria_to_text,
    equalize_weights, full_credit_points, has_unsaved_changes, is_allocation_criterion,
    text_to_criteria, validate_weights,
};
pub use leniency::{
    NEUTRAL_LENIENCY, RewriteError, accept_rewrite, leniency_rewrite_prompt,
    restore_category_weights,
};
pub use prepare::{
    DEFAULT_WEIGHT_MODE, editable_rubric_text, extract_model_text, prepare_for_grading,
    rubric_from_edited_text, rubric_from_text, rubric_text, unread_rubric_lines,
    with_default_weights,
};
