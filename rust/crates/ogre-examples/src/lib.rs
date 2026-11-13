//! Grades the teacher approved, kept so that the grader can be shown how the
//! same question was scored before.
//!
//! An example is a score and the feedback that went with it. It holds no
//! student's name and no student's answer. Examples are kept in a folder
//! ([`FolderStore`]), which is on the teacher's computer or behind the
//! server in [`server`], reached with [`ServerStore`].

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub mod client;
pub mod server;
mod store;

pub use client::ServerStore;
pub use store::FolderStore;

/// The most feedback kept with one example, in characters. The grader is
/// shown less than this of each.
pub const MAX_FEEDBACK_CHARS: usize = 1000;

/// The most examples kept for one rubric. Older ones make way.
pub const MAX_PER_RUBRIC: usize = 200;

/// How many of a rubric's examples are looked at when choosing which to show.
const CONSIDERED: usize = 12;

/// What stands in for a student's name where feedback used it.
const NAMELESS: &str = "[STUDENT]";

/// One grade the teacher approved.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradedExample {
    pub score: f64,
    pub max_score: f64,
    /// The feedback as text, with the student's name taken out.
    pub feedback: String,
    /// The teacher changed the score the AI proposed.
    #[serde(default)]
    pub changed: bool,
    /// When it was approved, in seconds since 1970.
    #[serde(default)]
    pub at: u64,
}

impl GradedExample {
    /// The example as it is kept: feedback trimmed and cut to
    /// [`MAX_FEEDBACK_CHARS`]. `None` for one that says nothing or whose
    /// numbers make no sense.
    pub fn tidy(&self) -> Option<Self> {
        let sound = self.score.is_finite()
            && self.max_score.is_finite()
            && self.score >= 0.0
            && self.max_score > 0.0;
        let feedback: String = self
            .feedback
            .trim()
            .chars()
            .take(MAX_FEEDBACK_CHARS)
            .collect();
        (sound && !feedback.is_empty()).then(|| Self {
            feedback,
            ..self.clone()
        })
    }
}

/// The name examples for a question are kept under: the same for the same
/// question and maximum score, whoever grades it and on whichever computer.
///
/// It is made from the question, so that a rubric the teacher has reworded
/// since still finds its examples. Where the page gave no question the
/// rubric's own text stands in. `None` when there is neither: such grades
/// cannot be told apart from those of any other question.
pub fn rubric_id(question: &str, rubric_text: &str, max_score: f64) -> Option<String> {
    let plain = |text: &str| {
        text.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    };
    let (kind, text) = match (plain(question), plain(rubric_text)) {
        (question, _) if !question.is_empty() => ("question", question),
        (_, rubric) if !rubric.is_empty() => ("rubric", rubric),
        _ => return None,
    };
    if !max_score.is_finite() || max_score <= 0.0 {
        return None;
    }
    let digest = Sha256::digest(format!("{kind}\n{max_score}\n{text}").as_bytes());
    Some(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// True for a name [`rubric_id`] could have made. Anything else is refused
/// before it comes near a file name.
pub fn is_rubric_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `text` with the student's name taken out: the whole name however it is
/// capitalised, and each part of it where it stands as a word, capitalised
/// as in the name. "the max is 80" keeps its "max" for a student called Max.
pub fn without_name(text: &str, name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        return text.to_owned();
    }
    let mut out = replace_ignoring_case(text, name, NAMELESS);
    let parts = name
        .split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-')
        .filter(|part| part.chars().count() >= 2);
    for part in parts {
        out = replace_word(&out, part, NAMELESS);
    }
    out
}

fn replace_ignoring_case(text: &str, what: &str, with: &str) -> String {
    let (lower_text, lower_what) = (text.to_lowercase(), what.to_lowercase());
    // Lowercasing can change a text's length; then the places would not line up.
    if lower_text.len() != text.len() || lower_what.is_empty() {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut from = 0;
    while let Some(found) = lower_text[from..].find(&lower_what) {
        let at = from + found;
        out.push_str(&text[from..at]);
        out.push_str(with);
        from = at + lower_what.len();
    }
    out.push_str(&text[from..]);
    out
}

fn replace_word(text: &str, word: &str, with: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut from = 0;
    while let Some(found) = text[from..].find(word) {
        let (at, end) = (from + found, from + found + word.len());
        let before = text[..at].chars().next_back();
        let after = text[end..].chars().next();
        let alone =
            !before.is_some_and(char::is_alphanumeric) && !after.is_some_and(char::is_alphanumeric);
        out.push_str(&text[from..at]);
        out.push_str(if alone { with } else { word });
        from = end;
    }
    out.push_str(&text[from..]);
    out
}

/// The examples to show a grader, out of all that are kept for a rubric.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Chosen {
    /// How many examples the choice was made from. Zero means none are shown.
    pub considered: usize,
    pub high: Option<GradedExample>,
    pub middle: Option<GradedExample>,
    pub low: Option<GradedExample>,
}

impl Chosen {
    /// How many examples the grader is shown.
    pub fn shown(&self) -> usize {
        [&self.high, &self.middle, &self.low]
            .into_iter()
            .flatten()
            .count()
    }
}

/// Chooses a high, a middle and a low score from the most recent examples.
/// Grades where the teacher changed the AI's score come first: those are
/// where the teacher's standard and the AI's differed.
pub fn choose(examples: &[GradedExample]) -> Chosen {
    let mut newest_first: Vec<&GradedExample> = examples.iter().collect();
    newest_first.sort_by_key(|example| std::cmp::Reverse(example.at));
    let (changed, as_proposed): (Vec<_>, Vec<_>) = newest_first
        .into_iter()
        .partition(|example| example.changed);
    let mut considered: Vec<&GradedExample> = changed
        .into_iter()
        .chain(as_proposed)
        .take(CONSIDERED)
        .collect();
    considered.sort_by(|a, b| part_of_max(b).total_cmp(&part_of_max(a)));

    let at = |index: usize| considered.get(index).map(|example| (*example).clone());
    let count = considered.len();
    Chosen {
        considered: count,
        high: at(0),
        middle: (count >= 3).then(|| at((count - 1) / 2)).flatten(),
        low: (count >= 2).then(|| at(count - 1)).flatten(),
    }
}

fn part_of_max(example: &GradedExample) -> f64 {
    example.score / example.max_score
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example(score: f64, at: u64, changed: bool) -> GradedExample {
        GradedExample {
            score,
            max_score: 10.0,
            feedback: format!("Feedback for {score}."),
            changed,
            at,
        }
    }

    #[test]
    fn the_same_question_has_the_same_name_however_it_is_spaced() {
        let id = rubric_id("Explain  the standard error.\n", "## Concept", 10.0).unwrap();
        assert!(is_rubric_id(&id), "{id}");
        assert_eq!(
            rubric_id("explain the Standard Error.", "another rubric", 10.0).as_ref(),
            Some(&id),
            "the rubric's wording is not part of the name"
        );
        assert_ne!(
            rubric_id("Explain the standard error.", "", 14.0).unwrap(),
            id
        );
        assert_ne!(
            rubric_id("Explain the margin of error.", "", 10.0).unwrap(),
            id
        );
    }

    #[test]
    fn the_name_does_not_change_between_versions_of_the_program() {
        // Examples already kept are found by this name: it must stay as it is.
        assert_eq!(
            rubric_id("What is a p-value?", "", 10.0).as_deref(),
            Some("181f817fb3df5fa1ab769e63b1af6072794f82fe1a64602011c364efeb5c79d8"),
        );
    }

    #[test]
    fn a_page_without_a_question_goes_by_its_rubric() {
        let by_rubric = rubric_id("  ", "Names the theorem", 5.0).unwrap();
        assert_ne!(
            by_rubric,
            rubric_id("Names the theorem", "", 5.0).unwrap(),
            "a rubric is not mistaken for a question with the same words"
        );
        assert_eq!(rubric_id("", " \n", 5.0), None);
        assert_eq!(rubric_id("A question", "", 0.0), None);
        assert_eq!(rubric_id("A question", "", f64::NAN), None);
    }

    #[test]
    fn only_a_made_name_is_a_name() {
        assert!(!is_rubric_id("../../etc/passwd"));
        assert!(!is_rubric_id(&"A".repeat(64)));
        assert!(!is_rubric_id(&"a".repeat(63)));
        assert!(is_rubric_id(&"0f".repeat(32)));
    }

    #[test]
    fn a_students_name_is_taken_out_of_feedback() {
        assert_eq!(
            without_name(
                "Kai, name the standard error. Good work, kai brook!",
                "Brook, Kai"
            ),
            "[STUDENT], name the standard error. Good work, kai brook!"
        );
        assert_eq!(
            without_name("BROOK, KAI did well. Brook's work is clear.", "Brook, Kai"),
            "[STUDENT] did well. [STUDENT]'s work is clear."
        );
        // A word that only looks like the name stays.
        assert_eq!(
            without_name("Max, the max is 80 and Maxine agrees.", "Max Lee"),
            "[STUDENT], the max is 80 and Maxine agrees."
        );
        assert_eq!(without_name("Nothing to hide.", ""), "Nothing to hide.");
    }

    #[test]
    fn an_example_is_kept_trimmed_and_only_if_it_says_something() {
        let long = GradedExample {
            feedback: format!("  {}  ", "é".repeat(MAX_FEEDBACK_CHARS + 50)),
            ..example(7.0, 1, false)
        };
        assert_eq!(
            long.tidy().unwrap().feedback.chars().count(),
            MAX_FEEDBACK_CHARS
        );
        let silent = GradedExample {
            feedback: " \n".into(),
            ..example(7.0, 1, false)
        };
        assert_eq!(silent.tidy(), None);
        assert_eq!(example(f64::NAN, 1, false).tidy(), None);
        assert_eq!(example(-1.0, 1, false).tidy(), None);
    }

    #[test]
    fn a_high_a_middle_and_a_low_score_are_chosen() {
        let kept: Vec<_> = [3.0, 9.0, 6.0, 7.0, 1.0]
            .into_iter()
            .enumerate()
            .map(|(at, score)| example(score, at as u64, false))
            .collect();
        let chosen = choose(&kept);
        assert_eq!(chosen.considered, 5);
        assert_eq!(chosen.shown(), 3);
        assert_eq!(chosen.high.unwrap().score, 9.0);
        assert_eq!(chosen.middle.unwrap().score, 6.0);
        assert_eq!(chosen.low.unwrap().score, 1.0);
    }

    #[test]
    fn few_examples_show_what_there_is() {
        assert_eq!(choose(&[]), Chosen::default());
        let one = choose(&[example(4.0, 1, false)]);
        assert_eq!((one.considered, one.shown()), (1, 1));
        let two = choose(&[example(4.0, 1, false), example(8.0, 2, false)]);
        assert_eq!(two.high.unwrap().score, 8.0);
        assert_eq!(two.middle, None);
        assert_eq!(two.low.unwrap().score, 4.0);
    }

    #[test]
    fn scores_the_teacher_changed_and_recent_ones_come_first() {
        // Twenty old grades the teacher let stand, at 5, and three recent
        // ones they changed.
        let mut kept: Vec<_> = (0..20).map(|at| example(5.0, at, false)).collect();
        kept.extend([
            example(2.0, 100, true),
            example(10.0, 101, true),
            example(8.0, 102, true),
        ]);
        let chosen = choose(&kept);
        assert_eq!(chosen.considered, CONSIDERED);
        assert_eq!(chosen.high.unwrap().score, 10.0);
        assert_eq!(chosen.low.unwrap().score, 2.0);

        // Among grades that stood, the newest are the ones looked at.
        let mut stood: Vec<_> = (0..30).map(|at| example(5.0, at, false)).collect();
        stood[29].score = 9.0;
        stood[0].score = 1.0;
        let chosen = choose(&stood);
        assert_eq!(chosen.high.unwrap().score, 9.0);
        assert_eq!(chosen.low.unwrap().score, 5.0, "the oldest is out of reach");
    }
}
