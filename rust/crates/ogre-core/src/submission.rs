use serde::{Deserialize, Serialize};

/// Everything read from one grading page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradingPage {
    pub url: String,
    pub title: String,
    /// Set when the site shows one student at a time ("Grading 2 of 28").
    pub position: Option<Position>,
    pub submissions: Vec<Submission>,
}

/// Where the page sits in a one-student-at-a-time sequence. `current` is 1-based.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub current: usize,
    pub total: usize,
}

/// One student's answer to one question, with the fields a grader would fill.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Submission {
    /// Position on the page, in document order.
    pub index: usize,
    /// The site's own id for the student, when the page exposes one. Stable
    /// across reloads, unlike `index`.
    pub student_id: Option<String>,
    pub name: String,
    /// One entry per score box; multi-part questions have several.
    pub scores: Vec<ScoreField>,
    pub feedback: Option<FeedbackField>,
    /// The student's answer, as markdown.
    pub response: String,
    /// The question as this student saw it, as markdown. Sites that randomize
    /// values give each student a different prompt.
    pub prompt: Option<String>,
}

impl Submission {
    /// Sum of the score boxes that hold a number, or `None` if none do.
    pub fn score(&self) -> Option<f64> {
        let mut values = self.scores.iter().filter_map(ScoreField::value).peekable();
        values.peek()?;
        Some(values.sum())
    }

    /// Total points available, or `None` if any score box has no known maximum.
    pub fn max_score(&self) -> Option<f64> {
        if self.scores.is_empty() {
            return None;
        }
        self.scores.iter().map(|s| s.max).sum()
    }

    /// True when a teacher or an earlier run already awarded points. Such
    /// scores must not be overwritten without the teacher saying so.
    pub fn has_nonzero_score(&self) -> bool {
        self.scores
            .iter()
            .filter_map(ScoreField::value)
            .any(|v| v != 0.0)
    }

    pub fn has_feedback(&self) -> bool {
        self.feedback
            .as_ref()
            .is_some_and(|f| !f.text.trim().is_empty())
    }
}

/// A score input on the page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreField {
    /// The form field name, used to find this exact box again when writing.
    pub field: String,
    /// The label the site gives the box, such as "Score for part 2".
    pub label: String,
    /// The box's contents exactly as read: a number, blank, or text like "N/A".
    pub raw: String,
    /// Points available for this box.
    pub max: Option<f64>,
}

impl ScoreField {
    /// The score as a number. Blank and non-numeric contents give `None`.
    pub fn value(&self) -> Option<f64> {
        let v: f64 = self.raw.trim().parse().ok()?;
        v.is_finite().then_some(v)
    }
}

/// The feedback box that belongs to a submission.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FeedbackField {
    /// The element id, used to find this exact box again when writing.
    pub field: String,
    pub kind: FeedbackKind,
    /// Existing feedback as plain text.
    pub text: String,
}

/// How a feedback box takes input, which decides how it has to be written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackKind {
    /// A plain `<textarea>`.
    Textarea,
    /// An editable element managed by a rich text editor.
    RichText,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn score(raw: &str, max: Option<f64>) -> ScoreField {
        ScoreField {
            field: "f".into(),
            label: "Score".into(),
            raw: raw.into(),
            max,
        }
    }

    fn submission(scores: Vec<ScoreField>) -> Submission {
        Submission {
            index: 0,
            student_id: None,
            name: "Avery, Sam".into(),
            scores,
            feedback: None,
            response: String::new(),
            prompt: None,
        }
    }

    #[test]
    fn blank_and_na_scores_have_no_value() {
        assert_eq!(score("", None).value(), None);
        assert_eq!(score("N/A", None).value(), None);
        assert_eq!(score("NaN", None).value(), None);
        assert_eq!(score(" 3.5 ", None).value(), Some(3.5));
    }

    #[test]
    fn score_sums_only_numeric_parts() {
        let s = submission(vec![score("3.5", Some(5.0)), score("N/A", Some(5.0))]);
        assert_eq!(s.score(), Some(3.5));
        assert_eq!(s.max_score(), Some(10.0));
    }

    #[test]
    fn score_is_none_when_nothing_is_numeric() {
        assert_eq!(submission(vec![score("", Some(10.0))]).score(), None);
        assert_eq!(submission(vec![]).score(), None);
        assert_eq!(submission(vec![]).max_score(), None);
    }

    #[test]
    fn max_score_is_unknown_if_any_part_is() {
        let s = submission(vec![score("1", Some(5.0)), score("1", None)]);
        assert_eq!(s.max_score(), None);
    }

    #[test]
    fn zero_is_not_a_nonzero_score() {
        assert!(!submission(vec![score("0", Some(10.0))]).has_nonzero_score());
        assert!(!submission(vec![score("", Some(10.0))]).has_nonzero_score());
        assert!(submission(vec![score("0", None), score("0.5", None)]).has_nonzero_score());
    }

    #[test]
    fn whitespace_feedback_does_not_count() {
        let mut s = submission(vec![]);
        assert!(!s.has_feedback());
        s.feedback = Some(FeedbackField {
            field: "fb-0-2-1001".into(),
            kind: FeedbackKind::RichText,
            text: "  \n".into(),
        });
        assert!(!s.has_feedback());
        s.feedback.as_mut().unwrap().text = "Nice work.".into();
        assert!(s.has_feedback());
    }
}
