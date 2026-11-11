//! Getting a scraped rubric ready to grade against, the way the desktop app
//! does between reading a page and pressing Grade.

use ogre_core::{
    DEFAULT_WEIGHT_MODE, NEUTRAL_LENIENCY, Rubric, accept_rewrite, leniency_rewrite_prompt,
    restore_category_weights, rubric_from_text, rubric_text, with_default_weights,
};
use ogre_llm::{ChatProvider, ChatRequest, Message};

/// A rubric ready for [`grade_batch`](crate::grade_batch).
#[derive(Debug, Clone, PartialEq)]
pub struct PreparedRubric {
    pub rubric: Rubric,
    /// The rubric text the teacher would see, after any leniency rewrite and
    /// with category weights filled in.
    pub text: String,
    /// Why the leniency rewrite was skipped, if it was asked for and failed.
    /// Grading then uses the rubric as written.
    pub rewrite_problem: Option<String>,
}

/// Prepares `scraped` for grading.
///
/// At a `leniency` other than 50 the AI is first asked to reword the rubric
/// (0 is most lenient, 100 most strict). A rewrite that fails or comes back
/// unusable is not fatal: the rubric is used as written and the reason is
/// reported. Category weights are then filled in as the desktop app does.
pub async fn prepare_rubric(
    provider: &dyn ChatProvider,
    scraped: &Rubric,
    leniency: u8,
) -> PreparedRubric {
    let original = rubric_text(scraped);
    let (text, rewrite_problem) = match leniency_rewrite_prompt(&original, leniency) {
        None => (original, None),
        Some(prompt) => {
            let reply = provider
                .chat(&ChatRequest::new([Message::user(prompt)]))
                .await
                .map_err(|error| error.to_string())
                .and_then(|reply| accept_rewrite(&original, &reply).map_err(|e| e.to_string()));
            match reply {
                Ok(rewritten) => (restore_category_weights(&rewritten, &original), None),
                Err(problem) => (original, Some(problem)),
            }
        }
    };
    let text = with_default_weights(&text, DEFAULT_WEIGHT_MODE);
    PreparedRubric {
        rubric: rubric_from_text(scraped, &text, DEFAULT_WEIGHT_MODE),
        text,
        rewrite_problem,
    }
}

/// True when [`prepare_rubric`] would ask the AI to reword the rubric.
pub fn rewrites_rubric(leniency: u8) -> bool {
    leniency != NEUTRAL_LENIENCY
}
