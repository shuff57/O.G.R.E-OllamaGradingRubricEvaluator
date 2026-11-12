//! A score worked out from what the feedback says about each requirement.
//!
//! The AI's own score is a judgment from 0 to 10, and the same verdicts can
//! come back with different points. This reads the verdicts instead: every
//! requirement is worth an equal share of its category, and categories count
//! by their weights. The same feedback always gives the same score.
//!
//! Not part of the Electron app; the teacher chooses it.

use std::sync::LazyLock;

use regex::Regex;

use super::parse::snap_score;
use super::types::Rubric;
use super::{js, pattern};

/// A requirement's heading: a paragraph that holds one bold run and nothing
/// else. Bold words inside a sentence are not headings.
static HEADING: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u:<p\b)[^>]*>\s*(?i-u:<strong\b)[^>]*>(?:[^<]|(?i-u:</?(?:em|code|sub|sup|i|u)>))*(?i-u:</strong>)\s*:?\s*(?i-u:</p>)",
    )
});
static BLOCKQUOTE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u:<blockquote)(?s:.)*?(?i-u:</blockquote>)"));
static PARAGRAPH: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u:<p\b)[^>]*>((?s:.)*?)(?i-u:</p>)"));
static TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"<[^>]+>"));

/// What feedback says about one requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Met: the whole share.
    Correct,
    /// Partly met: half the share.
    Partial,
    /// Incorrect, or not addressed: nothing.
    NotMet,
}

impl Verdict {
    fn credit(self) -> f64 {
        match self {
            Self::Correct => 1.0,
            Self::Partial => 0.5,
            Self::NotMet => 0.0,
        }
    }

    /// Reads the opening words of an evaluation.
    fn from_opening(text: &str) -> Self {
        let text = text
            .trim_start_matches(|c: char| !c.is_alphabetic())
            .to_lowercase();
        let opens_with = |words: &[&str]| words.iter().any(|word| text.starts_with(word));
        if opens_with(&["correct"]) {
            Self::Correct
        } else if opens_with(&["partial", "partly", "incomplete", "mostly correct"]) {
            Self::Partial
        } else {
            Self::NotMet
        }
    }
}

/// The verdict in each requirement section of `feedback`, in order. A
/// section is a heading, usually a quotation of the student, and then an
/// evaluation that opens with the verdict.
///
/// `None` where a section has no evaluation to read, which makes the whole
/// feedback unusable for scoring.
pub fn feedback_verdicts(feedback: &str) -> Option<Vec<Verdict>> {
    let headings: Vec<_> = HEADING.find_iter(feedback).collect();
    let mut verdicts = Vec::with_capacity(headings.len());
    for (index, heading) in headings.iter().enumerate() {
        let end = headings
            .get(index + 1)
            .map_or(feedback.len(), |next| next.start());
        let section = BLOCKQUOTE.replace_all(&feedback[heading.end()..end], " ");
        // The first paragraph that is not the "To improve" line; failing
        // that, whatever text the section holds outside paragraphs.
        let evaluation = PARAGRAPH
            .captures_iter(&section)
            .map(|paragraph| plain(&paragraph[1]))
            .find(|text| !text.is_empty() && !text.to_lowercase().starts_with("to improve"))
            .or_else(|| Some(plain(&PARAGRAPH.replace_all(&section, " "))))
            .filter(|text| !text.is_empty())?;
        verdicts.push(Verdict::from_opening(&evaluation));
    }
    Some(verdicts)
}

fn plain(html: &str) -> String {
    js::trim(&TAG.replace_all(html, " ")).to_owned()
}

/// The score `feedback` adds up to under `rubric`, out of the rubric's
/// maximum and rounded as scores are.
///
/// Each requirement is an equal share of its category. Categories count by
/// the rubric's category weights, or equally where it has none.
///
/// `None` when the feedback does not have exactly one readable section per
/// requirement, in which case there is nothing sound to compute from.
pub fn score_from_verdicts(feedback: &str, rubric: &Rubric) -> Option<f64> {
    let verdicts = feedback_verdicts(feedback)?;
    let categories: Vec<_> = rubric
        .checklist_items
        .iter()
        .filter(|item| !item.items.is_empty())
        .collect();
    let requirements: usize = categories.iter().map(|item| item.items.len()).sum();
    if requirements == 0 || verdicts.len() != requirements {
        return None;
    }

    let weight_of = |category: Option<&str>| {
        rubric
            .category_weights
            .as_ref()
            .zip(category)
            .and_then(|(weights, category)| weights.get(category))
            .copied()
            .filter(|weight| weight.is_finite() && *weight > 0.0)
    };
    let weights: Vec<Option<f64>> = categories
        .iter()
        .map(|item| weight_of(item.category.as_deref()))
        .collect();
    // Weights count only if every category has one.
    let weighted = weights.iter().all(Option::is_some);

    let (mut earned, mut possible) = (0.0, 0.0);
    let mut remaining = verdicts.iter();
    for (item, weight) in categories.iter().zip(&weights) {
        let weight = if weighted { weight.unwrap_or(1.0) } else { 1.0 };
        let credit: f64 = remaining
            .by_ref()
            .take(item.items.len())
            .map(|verdict| verdict.credit())
            .sum();
        earned += weight * credit / item.items.len() as f64;
        possible += weight;
    }
    let max_score = rubric.max_score_value();
    Some(snap_score(earned / possible * max_score, max_score))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rubric(weights: Option<&[(&str, f64)]>) -> Rubric {
        let mut rubric: Rubric = serde_json::from_value(serde_json::json!({
            "maxScore": 14,
            "checklistItems": [
                { "category": "Count", "items": ["Says how many outcomes", "Says why"] },
                { "category": "Event", "items": ["Names the outcomes", "Counts them"] },
                { "category": "Answer", "items": ["Gives the probability", "Shows the numbers"] }
            ]
        }))
        .unwrap();
        rubric.category_weights =
            weights.map(|weights| weights.iter().map(|(k, v)| ((*k).to_owned(), *v)).collect());
        rubric
    }

    fn section(heading: &str, evaluation: &str) -> String {
        format!(
            "<p><strong>{heading}</strong></p><blockquote>You said: \"it is not wrong\"</blockquote><p>{evaluation}</p><p><em>To improve: N/A</em></p>"
        )
    }

    fn feedback(evaluations: [&str; 6]) -> String {
        let sections: String = evaluations
            .iter()
            .enumerate()
            .map(|(i, evaluation)| section(&format!("Requirement {}", i + 1), evaluation))
            .collect();
        format!("<p>Hi Sam,</p>{sections}")
    }

    const CORRECT: &str = "Correct. You named it.";

    #[test]
    fn everything_correct_is_full_marks() {
        let all = feedback([CORRECT; 6]);
        assert_eq!(score_from_verdicts(&all, &rubric(None)), Some(14.0));
    }

    #[test]
    fn one_missed_requirement_costs_its_share() {
        // One of two in one of three equal categories: a sixth of 14.
        let one = feedback([
            CORRECT,
            "Incorrect. The count is 36.",
            CORRECT,
            CORRECT,
            CORRECT,
            CORRECT,
        ]);
        assert_eq!(score_from_verdicts(&one, &rubric(None)), Some(11.5));
        // A partly met requirement costs half of that.
        let half = feedback([
            CORRECT,
            "Incomplete — you gave the count but not why.",
            CORRECT,
            CORRECT,
            CORRECT,
            CORRECT,
        ]);
        assert_eq!(score_from_verdicts(&half, &rubric(None)), Some(13.0));
    }

    #[test]
    fn the_same_feedback_always_gives_the_same_score() {
        let mixed = feedback([
            CORRECT,
            "Partially correct.",
            "Incorrect.",
            "You did not say how many.",
            CORRECT,
            CORRECT,
        ]);
        let first = score_from_verdicts(&mixed, &rubric(None));
        assert_eq!(first, Some(8.0)); // (0.75 + 0 + 1) / 3 of 14 = 8.17
        assert_eq!(score_from_verdicts(&mixed, &rubric(None)), first);
    }

    #[test]
    fn nothing_met_is_zero() {
        let none = feedback(["Incorrect."; 6]);
        assert_eq!(score_from_verdicts(&none, &rubric(None)), Some(0.0));
    }

    #[test]
    fn category_weights_decide_how_much_a_category_counts() {
        let weights = [("Count", 50.0), ("Event", 25.0), ("Answer", 25.0)];
        let missed_count = feedback([
            "Incorrect.",
            "Incorrect.",
            CORRECT,
            CORRECT,
            CORRECT,
            CORRECT,
        ]);
        assert_eq!(
            score_from_verdicts(&missed_count, &rubric(Some(&weights))),
            Some(7.0)
        );
        // Equal categories would take a third.
        assert_eq!(score_from_verdicts(&missed_count, &rubric(None)), Some(9.5));
        // Weights that leave a category out are not used at all.
        let partial = [("Count", 50.0), ("Event", 50.0)];
        assert_eq!(
            score_from_verdicts(&missed_count, &rubric(Some(&partial))),
            Some(9.5)
        );
    }

    #[test]
    fn verdicts_are_read_from_the_opening_words() {
        let read = |evaluation: &str| feedback_verdicts(&section("H", evaluation)).unwrap()[0];
        assert_eq!(read("Correct. Well put."), Verdict::Correct);
        assert_eq!(read("<em>Correct</em> — yes."), Verdict::Correct);
        assert_eq!(read("✓ Correct."), Verdict::Correct);
        assert_eq!(read("Incorrect. The count is 36."), Verdict::NotMet);
        assert_eq!(read("Not correct."), Verdict::NotMet);
        assert_eq!(read("Incomplete. Say why."), Verdict::Partial);
        assert_eq!(read("Partially correct."), Verdict::Partial);
        assert_eq!(read("The answer should name the theorem."), Verdict::NotMet);
    }

    #[test]
    fn bold_words_inside_a_sentence_are_not_headings() {
        let html = format!(
            "<p>Hi Kai,</p>{}",
            section(
                "Names it",
                "Correct. You named the <strong>standard error</strong>."
            )
        );
        assert_eq!(feedback_verdicts(&html), Some(vec![Verdict::Correct]));
    }

    #[test]
    fn what_the_student_is_quoted_as_saying_is_not_the_verdict() {
        let html = "<p><strong>Names it</strong></p><blockquote><p>Correct answer is 5</p></blockquote><p>Incorrect. It is 6.</p>";
        assert_eq!(feedback_verdicts(html), Some(vec![Verdict::NotMet]));
    }

    #[test]
    fn feedback_that_does_not_cover_every_requirement_gives_no_score() {
        let five: String = (0..5).map(|_| section("H", CORRECT)).collect();
        assert_eq!(score_from_verdicts(&five, &rubric(None)), None);
        assert_eq!(score_from_verdicts("Graded by AI.", &rubric(None)), None);
        assert_eq!(
            score_from_verdicts("<p>No response submitted.</p>", &rubric(None)),
            None
        );
        // A heading with nothing after it cannot be read.
        let empty = format!("{}<p><strong>Last</strong></p>", feedback([CORRECT; 6]));
        assert_eq!(feedback_verdicts(&empty), None);
        // And a rubric without requirements has nothing to score against.
        assert_eq!(
            score_from_verdicts(&feedback([CORRECT; 6]), &Rubric::default()),
            None
        );
    }

    #[test]
    fn a_verdict_outside_a_paragraph_is_still_read() {
        let html = "<p><strong>Names it</strong></p><blockquote>You said: x</blockquote>Incomplete — say more.<p><em>To improve: add the name.</em></p>";
        assert_eq!(feedback_verdicts(html), Some(vec![Verdict::Partial]));
    }
}
