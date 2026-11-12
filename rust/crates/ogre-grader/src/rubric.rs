//! Getting a scraped rubric ready to grade against, the way the desktop app
//! does between reading a page and pressing Grade.

use ogre_core::{
    DEFAULT_WEIGHT_MODE, NEUTRAL_LENIENCY, Rubric, accept_rewrite, extract_model_text,
    grading_text, leniency_rewrite_prompt, restore_category_weights, rubric_from_grading_text,
    rubric_from_text, rubric_text, text_to_criteria, with_default_weights,
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
    let (text, rewrite_problem) = reword(provider, rubric_text(scraped), leniency).await;
    let text = with_default_weights(&text, DEFAULT_WEIGHT_MODE);
    PreparedRubric {
        rubric: rubric_from_text(scraped, &text, DEFAULT_WEIGHT_MODE),
        text,
        rewrite_problem,
    }
}

/// Prepares a rubric whose text the teacher has changed. `text` is what they
/// left in the editor, and it alone decides the requirements and the exemplar
/// answer; `scraped` supplies the question and the maximum score.
///
/// Leniency rewords the requirements as in [`prepare_rubric`], but never the
/// teacher's exemplar answer.
pub async fn prepare_edited_rubric(
    provider: &dyn ChatProvider,
    scraped: &Rubric,
    text: &str,
    leniency: u8,
) -> PreparedRubric {
    // Every line the teacher wrote is a requirement from here on. What the
    // AI adds while rewording is not: that text is read as it stands.
    let original = grading_text(text);
    let (reworded, rewrite_problem) = if text_to_criteria(&original).is_empty() {
        // Nothing the rewrite could keep; it would refuse or invent a rubric.
        (original, None)
    } else {
        reword(provider, original, leniency).await
    };
    let mut rubric = rubric_from_grading_text(scraped, &reworded, DEFAULT_WEIGHT_MODE);
    rubric.model_text = extract_model_text(text);
    PreparedRubric {
        rubric,
        text: with_default_weights(&reworded, DEFAULT_WEIGHT_MODE),
        rewrite_problem,
    }
}

/// Asks the AI to reword `original` for `leniency`. Returns the text to use
/// and, when the rewrite was asked for and failed, why.
async fn reword(
    provider: &dyn ChatProvider,
    original: String,
    leniency: u8,
) -> (String, Option<String>) {
    let Some(prompt) = leniency_rewrite_prompt(&original, leniency) else {
        return (original, None);
    };
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

/// True when [`prepare_rubric`] would ask the AI to reword the rubric.
pub fn rewrites_rubric(leniency: u8) -> bool {
    leniency != NEUTRAL_LENIENCY
}
