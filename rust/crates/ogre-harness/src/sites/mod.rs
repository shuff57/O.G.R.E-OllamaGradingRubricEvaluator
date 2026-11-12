//! Site adapters: what OGRE knows about specific grading sites.

use std::sync::Arc;

use async_trait::async_trait;
use ogre_core::{GradeWrite, GradingPage, QuestionLink, Rubric, format_score};

use crate::{PageDriver, Result};

pub mod canvas;
pub mod generic;
pub mod imathas;

/// How to read and fill the grading pages of one kind of site.
#[async_trait]
pub trait SiteAdapter: Send + Sync {
    /// The site's name as a teacher knows it.
    fn name(&self) -> &'static str;

    /// Whether `url` is a grading page this adapter handles.
    fn matches(&self, url: &str) -> bool;

    /// Reads every student on the page. Changes nothing.
    async fn read_page(&self, page: &dyn PageDriver) -> Result<GradingPage>;

    /// Reads the rubric the question carries. Changes nothing.
    async fn read_rubric(&self, page: &dyn PageDriver) -> Result<Rubric>;

    /// Puts one student's score and feedback where the site takes them.
    ///
    /// Fails without changing anything if the score on the page is no longer
    /// the one that was read.
    async fn write_grade(&self, page: &dyn PageDriver, write: &GradeWrite) -> Result<WriteReceipt>;

    /// True if [`Self::write_grade`] stores the grade on the site right away.
    /// False if it only fills a form that [`Self::save`] then submits.
    fn saves_on_write(&self) -> bool;

    /// Stores what was written, and returns once the site has confirmed it.
    async fn save(&self, page: &dyn PageDriver) -> Result<()>;

    /// The questions of the assignment the page belongs to, in the site's
    /// order, for moving from one question to the next. Changes nothing.
    /// Empty where the site has no such list or the adapter cannot read it.
    async fn questions(&self, _page: &dyn PageDriver) -> Result<Vec<QuestionLink>> {
        Ok(Vec::new())
    }
}

/// What a write left on the page, read back straight afterwards.
#[derive(Debug, Clone, PartialEq)]
pub struct WriteReceipt {
    pub score: String,
    /// The feedback as text, if feedback was written.
    pub feedback_text: Option<String>,
}

/// A written value that a later read of the page does not show.
#[derive(Debug, Clone, PartialEq)]
pub struct Mismatch {
    pub name: String,
    pub problem: String,
}

/// The sites OGRE can work with: the built-in ones, plus any the teacher has
/// mapped themselves. Earlier entries win when several match an address.
#[derive(Clone)]
pub struct Sites {
    adapters: Vec<Arc<dyn SiteAdapter>>,
}

impl Sites {
    /// The sites OGRE knows without being taught.
    pub fn built_in() -> Self {
        Self {
            adapters: vec![Arc::new(imathas::IMathAs), Arc::new(canvas::Canvas)],
        }
    }

    /// Adds an adapter that is tried after the ones already present.
    pub fn with(mut self, adapter: Arc<dyn SiteAdapter>) -> Self {
        self.adapters.push(adapter);
        self
    }

    /// The adapter for the grading page at `url`, if any site matches.
    pub fn adapter_for(&self, url: &str) -> Option<Arc<dyn SiteAdapter>> {
        self.adapters
            .iter()
            .find(|adapter| adapter.matches(url))
            .cloned()
    }
}

/// Re-reads the page and checks that every write is still there.
///
/// Run this after a batch of writes and before saving: a write the page did
/// not keep must stop the run, not be saved over.
pub async fn verify_writes(
    adapter: &dyn SiteAdapter,
    page: &dyn PageDriver,
    written: &[(GradeWrite, WriteReceipt)],
) -> Result<Vec<Mismatch>> {
    let now = adapter.read_page(page).await?;
    let mut mismatches = Vec::new();
    for (write, receipt) in written {
        let mismatch = |problem: String| Mismatch {
            name: write.name.clone(),
            problem,
        };
        let Some(submission) = now.submissions.iter().find(|s| {
            s.scores
                .iter()
                .any(|score| score.field == write.score.field)
        }) else {
            mismatches.push(mismatch("is no longer on the page".into()));
            continue;
        };
        let score = submission
            .scores
            .iter()
            .find(|score| score.field == write.score.field)
            .and_then(|score| score.value());
        if score != Some(write.score.value) {
            mismatches.push(mismatch(format!(
                "score should be {} but the page shows {}",
                format_score(write.score.value),
                score.map_or_else(|| "nothing".to_owned(), format_score),
            )));
        }
        if let Some(expected) = &receipt.feedback_text {
            let shown = submission.feedback.as_ref().map(|f| f.text.as_str());
            if !feedback_matches(expected, shown.unwrap_or_default()) {
                mismatches.push(mismatch(
                    "feedback on the page differs from what was written".into(),
                ));
            }
        }
    }
    Ok(mismatches)
}

/// Whether the page shows the feedback that was written.
///
/// White space is not compared: a rich-text editor keeps the words and drops
/// the line breaks between paragraphs (MyOpenMath's does), so "Hi Sam,
/// First" comes back as "Hi Sam,First". And the page re-renders math written
/// between backticks, which changes the text from that point on, so only the
/// part before the first formula is compared.
fn feedback_matches(expected: &str, shown: &str) -> bool {
    let (expected, shown) = (without_space(expected), without_space(shown));
    match expected.split_once('`') {
        None => expected == shown,
        Some((before_math, _)) => shown.starts_with(before_math),
    }
}

fn without_space(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_adapter_for_a_known_site() {
        let sites = Sites::built_in();
        let found = sites.adapter_for("https://www.myopenmath.com/course/gradeallq2.php?cid=1");
        assert_eq!(found.map(|a| a.name()), Some("MyOpenMath"));
        let found = sites.adapter_for(
            "https://school.instructure.com/courses/12/gradebook/speed_grader?assignment_id=34",
        );
        assert_eq!(found.map(|a| a.name()), Some("Canvas"));
        assert!(sites.adapter_for("https://example.com/grades").is_none());
    }

    #[test]
    fn feedback_with_math_is_compared_up_to_the_first_formula() {
        assert!(feedback_matches("Good work.", "Good work."));
        assert!(!feedback_matches("Good work.", "Good work"));
        assert!(feedback_matches(
            "The slope `9` is right.",
            "The slope 9 is right."
        ));
        assert!(!feedback_matches("The slope `9` is right.", "A slope"));
    }

    #[test]
    fn an_editor_that_drops_the_breaks_between_paragraphs_still_matches() {
        // Written with line breaks between the paragraphs; MyOpenMath's
        // editor shows the same words with none.
        let written =
            "Hi Sam, First requirement You said: \"abc\" Correct. The slope `9` is right.";
        let shown = "Hi Sam,First requirementYou said: \"abc\"Correct. The slope is right.";
        assert!(feedback_matches(written, shown));
        assert!(feedback_matches(
            "Hi Sam,\n\nGood work.",
            "Hi Sam,Good work."
        ));
        // Different words are still a mismatch.
        assert!(!feedback_matches("Hi Sam, Good work.", "Hi Sam,Good try."));
        assert!(!feedback_matches(written, "Hi Sam,Second requirement"));
        // Nothing on the page is not what was written.
        assert!(!feedback_matches("Good work.", ""));
    }
}
