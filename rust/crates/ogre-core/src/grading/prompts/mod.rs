//! Builders for every prompt sent to the AI.
//!
//! The wording was tuned by experiment. Each builder must produce the same
//! text as the JavaScript grading server for the same input, down to the
//! byte, so the odd spacing in places is deliberate.

mod batch;
mod outlier;
mod single;
mod sweep;

use std::sync::LazyLock;

use regex::Regex;

pub use batch::build_batch_prompt;
pub use outlier::build_outlier_review_prompt;
pub use single::build_single_grade_prompt;
pub use sweep::{build_compact_sweep_prompt, build_pairwise_sweep_prompts};

use super::constants::SCORING_SCALE_DESCRIPTORS;
use super::js::{self, Num, WS};
use super::pattern;
use super::types::{Anchor, GradingError, Rubric, ScaleDescriptor, ScoringAnchors};

/// Every prompt asks for scores out of 10, whatever the rubric's maximum. The
/// parsers convert back.
const VIRTUAL_MAX: u8 = 10;
const SCORE_HINT: &str = "integer 0-10 (see SCORING SCALE below)";
const NO_PROMPT: &str = "(No prompt provided)";
const NO_RESPONSE: &str = "(No response submitted)";
const EMBEDDED_INSTRUCTIONS_MARKER: &str = "\n\nADDITIONAL GRADING INSTRUCTIONS:\n";
const CALIBRATION_HEADER: &str = "SCORING CALIBRATION:";

/// Without this, models award a holistic sub-maximum score while marking
/// every requirement correct.
const SCORE_FEEDBACK_CONSISTENCY_RULE: &str = r#"SCORE/FEEDBACK CONSISTENCY RULE: Your score and your feedback must agree. If every requirement is marked Correct, the score MUST be full credit (10). Never deduct points you cannot justify: if the score is below 10, at least one requirement section MUST name what was explicitly incorrect or missing and include its own specific "To improve" line. "To improve: N/A" is only allowed when the student earned full credit. Do not repeat the same "To improve" sentence under multiple requirements. Never write a verdict that starts with Correct and then says the work is incorrect, wrong, or missing — if any part of that requirement is wrong, mark it Partial or Incorrect. Every point below full credit must map to a named requirement and a non-N/A "To improve" line; a passing mention of an error inside a Correct verdict does not count as an explanation."#;

const FEEDBACK_FORMAT_RULE: &str = r#"FEEDBACK FORMAT RULE: The feedback string must contain one section for EACH numbered requirement from GRADING REQUIREMENTS. Do NOT group by category. Use HTML tags: <strong> for the requirement header, <blockquote> for the student's words (or "You did not address this."), <p> for your evaluation, <em> for the "To improve" line. Wrap all math expressions in backticks, e.g. `x^2 + 3x` or `p < 0.05`. For ANY requirement that is not at full credit, you MUST include both (a) a specific reason citing the student's words or omission, and (b) a "To improve" line with an actionable next step. Critiques and "To improve" suggestions MUST cite a specific rubric requirement that was not met. Do NOT invent additional standards (e.g., showing intermediate work, extra clarity, formatting polish) that the rubric does not explicitly require. If the response satisfies what the rubric asks, mark it correct — even if a more detailed answer is conceivable. criterion_scores uses categories for scoring, but feedback MUST be per-requirement."#;

const PARTIAL_CREDIT_RULE: &str = "PARTIAL CREDIT RULE: When a requirement is addressed conceptually but lacks specific values, formulas, or concrete evidence, award 40-60% of that category's points. Award 20-40% if only loosely related; 60-80% if substantially complete but missing one key element. Evaluate each requirement INDEPENDENTLY - do not let strength on one compensate for weakness on another.";

const CONCEPTUAL_THOROUGHNESS_RULE: &str = "CONCEPTUAL THOROUGHNESS RULE: When a student demonstrates genuine understanding of the underlying concept — correct reasoning, valid approach, or sound logic — but has execution flaws (arithmetic errors, missing units, informal notation, incomplete steps), award 60-80% of that category's points. Concept mastery with flawed execution always scores higher than rote correctness without understanding. A student who explains WHY a method works but makes a calculation error deserves more credit than one who copies a formula without understanding it.";

static POINTS_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"{WS}*\([0-9]+{WS}*(?i-u:pts?)\)")));

/// Scoring anchors for a rubric: fixed fractions of its maximum score.
pub fn generate_scoring_anchors(rubric: &Rubric) -> ScoringAnchors {
    let max = rubric.max_score_value();
    // Small maximums keep one decimal so the anchors do not collapse onto the
    // same integer.
    let anchor = |fraction: f64, description: &str| Anchor {
        score: if max < 6.0 {
            js::round_to(max * fraction, 10.0)
        } else {
            js::round(max * fraction)
        },
        description: description.to_owned(),
    };
    ScoringAnchors {
        excellent: anchor(
            0.95,
            "Demonstrates clear understanding with most key concepts addressed.",
        ),
        adequate: anchor(
            0.80,
            "Addresses the topic and shows awareness of key concepts, even with gaps or imprecision.",
        ),
        below_average: anchor(
            0.65,
            "Makes a genuine attempt that engages with the prompt, showing limited but real understanding.",
        ),
        minimal: anchor(
            0.45,
            "Shows some effort and awareness related to the topic, even if mostly incomplete.",
        ),
    }
}

/// A checklist category without its "(5 pts)" suffix: the key the AI is asked
/// to use in `criterion_scores`.
pub(crate) fn criterion_name(category: &str) -> String {
    js::trim(&POINTS_SUFFIX.replace(category, "")).to_owned()
}

/// The criterion name of every checklist item.
fn criterion_names(rubric: &Rubric) -> Result<Vec<String>, GradingError> {
    rubric
        .checklist_items
        .iter()
        .enumerate()
        .map(|(index, item)| match &item.category {
            Some(category) => Ok(criterion_name(category)),
            None => Err(GradingError::MissingCategory { index }),
        })
        .collect()
}

fn non_empty(text: &Option<String>) -> Option<&str> {
    text.as_deref().filter(|t| !t.is_empty())
}

/// Every requirement in the rubric, across categories, in order.
fn requirements(rubric: &Rubric) -> impl Iterator<Item = &str> {
    rubric
        .checklist_items
        .iter()
        .flat_map(|item| item.items.iter().map(String::as_str))
}

/// Custom instructions split by how binding they are.
struct CustomInstructions<'a> {
    /// Example scores, shown for reference only.
    calibration: Option<&'a str>,
    /// The teacher's instructions, which the AI must follow.
    overrides: Option<&'a str>,
}

/// Separates a leading `SCORING CALIBRATION:` block from the instructions
/// after it. The block ends at the first blank line that is not followed by
/// another anchor label.
fn extract_custom_instructions(custom: &str) -> CustomInstructions<'_> {
    const ANCHOR_LABELS: [&str; 4] = ["Excellent", "Adequate", "Below Average", "Minimal"];

    if custom.is_empty() {
        return CustomInstructions {
            calibration: None,
            overrides: None,
        };
    }
    let Some(after_header) = custom.strip_prefix(CALIBRATION_HEADER) else {
        return CustomInstructions {
            calibration: None,
            overrides: Some(custom),
        };
    };
    // The original skips the header plus one character, assuming a newline.
    let mut body = after_header.chars();
    body.next();
    let body = body.as_str();

    let mut split = None;
    let mut search_from = 0;
    while search_from < body.len() {
        let Some(found) = body[search_from..].find("\n\n") else {
            break;
        };
        let at = search_from + found;
        let after = js::trim_start(&body[at + 2..]);
        if !after.is_empty() && !ANCHOR_LABELS.iter().any(|label| after.starts_with(label)) {
            split = Some(at);
            break;
        }
        search_from = at + 2;
    }

    let (calibration, overrides) = match split {
        Some(at) => (&body[..at], &body[at..]),
        None => (body, ""),
    };
    fn present(part: &str) -> Option<&str> {
        Some(js::trim(part)).filter(|p| !p.is_empty())
    }
    CustomInstructions {
        calibration: present(calibration),
        overrides: present(overrides),
    }
}

/// Splits an essay prompt that had the teacher's instructions appended to it
/// into the trimmed prompt and the trimmed instructions.
fn split_embedded_instructions(essay_prompt: &str) -> Option<(&str, &str)> {
    let (prompt, instructions) = essay_prompt.split_once(EMBEDDED_INSTRUCTIONS_MARKER)?;
    (!instructions.is_empty()).then(|| (js::trim(prompt), js::trim(instructions)))
}

fn push_overrides(prompt: &mut String, overrides: Option<&str>) {
    if let Some(overrides) = overrides {
        *prompt += &format!(
            "INSTRUCTOR OVERRIDE INSTRUCTIONS (you MUST follow these \u{2014} they take absolute precedence):\n{overrides}\n\n"
        );
    }
}

/// The numbered requirements and the per-category scoring list.
fn push_requirements(prompt: &mut String, rubric: &Rubric) {
    prompt.push_str("\nGRADING REQUIREMENTS (write feedback for EACH numbered item):\n");
    let mut number = 1;
    for item in &rubric.checklist_items {
        let category = non_empty(&item.category).unwrap_or("General");
        for requirement in &item.items {
            *prompt += &format!("{number}. [{category}] {requirement}\n");
            number += 1;
        }
    }
    prompt.push_str(
        "\nSCORING BY CATEGORY (score each 0-10, server applies weights automatically):\n",
    );
    for item in &rubric.checklist_items {
        if let Some(category) = non_empty(&item.category) {
            *prompt += &format!("- {category}: 10 points\n");
        }
    }
}

fn push_category_weights(prompt: &mut String, rubric: &Rubric) {
    let Some(weights) = rubric.category_weights.as_ref().filter(|w| !w.is_empty()) else {
        return;
    };
    prompt.push_str("\nCATEGORY WEIGHTS (percentage of total grade):\n");
    for (category, percent) in weights.iter() {
        *prompt += &format!("- {category}: {}% of total grade\n", Num(*percent));
    }
    prompt.push_str(
        "Grade each category on its own merits. These weights will be applied automatically.\n",
    );
}

fn push_key_concepts(prompt: &mut String, rubric: &Rubric) {
    if rubric.rubric_items.is_empty() {
        return;
    }
    prompt.push_str("\nKEY CONCEPTS TO ADDRESS:\n");
    for item in &rubric.rubric_items {
        if let Some(category) = non_empty(&item.category) {
            *prompt += &format!("{category}:\n");
        }
        for concept in &item.items {
            *prompt += &format!("  - {concept}\n");
        }
    }
}

fn push_model_response(prompt: &mut String, rubric: &Rubric) {
    if let Some(model_text) = non_empty(&rubric.model_text) {
        *prompt += &format!("\nMODEL RESPONSE (for reference):\n{model_text}\n");
    }
}

fn push_calibration(prompt: &mut String, calibration: Option<&str>) {
    if let Some(calibration) = calibration {
        *prompt += &format!(
            "\nSCORING CALIBRATION EXAMPLES (use to calibrate score levels only \u{2014} grade against rubric criteria and SCORING SCALE above, not these examples):\n{calibration}\n"
        );
    }
}

/// The four anchor lines under a `SCORING ANCHORS:` heading, with scores on
/// the rubric's real scale.
fn anchor_block(anchors: &ScoringAnchors, max_score: f64) -> String {
    let max = Num(max_score);
    let line = |label: &str, anchor: &Anchor| {
        format!(
            "- {label} ({}/{max}): {}\n",
            Num(anchor.score),
            anchor.description
        )
    };
    format!(
        "SCORING ANCHORS:\n{}{}{}{}",
        line("Excellent", &anchors.excellent),
        line("Adequate", &anchors.adequate),
        line("Below Average", &anchors.below_average),
        line("Minimal", &anchors.minimal),
    )
}

fn scoring_scale(custom: Option<&[ScaleDescriptor]>) -> String {
    let lines: Vec<String> = match custom {
        Some(descriptors) => descriptors
            .iter()
            .map(|d| scale_line(d.score, &d.descriptor))
            .collect(),
        None => SCORING_SCALE_DESCRIPTORS
            .iter()
            .map(|&(score, descriptor)| scale_line(f64::from(score), descriptor))
            .collect(),
    };
    format!(
        "SCORING SCALE (use integers 0-10 \u{2014} server converts to actual points):\n{}",
        lines.join("\n")
    )
}

fn scale_line(score: f64, descriptor: &str) -> String {
    format!("{:>2} \u{2013} {descriptor}", Num(score).to_string())
}

/// How much guidance the worked feedback example spells out.
#[derive(Clone, Copy)]
enum ExampleStyle {
    /// Used by the batch, outlier and sweep prompts.
    Full,
    /// Used by the single-response prompt.
    Brief,
}

/// A worked example of per-requirement feedback built from the rubric's own
/// requirements: the first answered, the second unanswered, the rest as
/// stubs. Models follow an example more reliably than a description.
///
/// The `\n` and `\"` here are literal backslash sequences: the example sits
/// inside a JSON string in the prompt.
fn feedback_example(rubric: &Rubric, style: ExampleStyle) -> String {
    let mut example = String::new();
    for (position, requirement) in requirements(rubric).enumerate() {
        example += &format!(r"\n<p><strong>{requirement}</strong></p>");
        example += match (position, style) {
            (0, ExampleStyle::Full) => {
                r#"\n<blockquote>You said: \"[quote what student wrote]\"</blockquote>\n<p>[Correct/Incorrect/Incomplete — explain WHY; wrap math in backticks, e.g. `x^2 + 3x`]</p>\n<p><em>To improve: [specific suggestion]</em></p>"#
            }
            (0, ExampleStyle::Brief) => {
                r#"\n<blockquote>You said: \"[quote]\"</blockquote>\n<p>[Correct/Incorrect — explain WHY; wrap math in backticks, e.g. `x^2 + 3x`]</p>\n<p><em>To improve: [suggestion]</em></p>"#
            }
            (1, ExampleStyle::Full) => {
                r"\n<blockquote>You did not address this.</blockquote>\n<p>[Explain what was expected]</p>\n<p><em>To improve: [specific suggestion]</em></p>"
            }
            (1, ExampleStyle::Brief) => {
                r"\n<blockquote>You did not address this.</blockquote>\n<p>[What was expected]</p>\n<p><em>To improve: [suggestion]</em></p>"
            }
            _ => r"\n<blockquote>You said: ...</blockquote>\n<p>...</p>",
        };
    }
    example
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_instructions_are_all_override() {
        let parts = extract_custom_instructions("Be strict");
        assert_eq!(parts.calibration, None);
        assert_eq!(parts.overrides, Some("Be strict"));
        let parts = extract_custom_instructions("");
        assert_eq!((parts.calibration, parts.overrides), (None, None));
    }

    #[test]
    fn calibration_block_ends_at_first_non_anchor_paragraph() {
        let parts = extract_custom_instructions(
            "SCORING CALIBRATION:\nExcellent (9/10): Perfect\n\nAdequate (7/10): Solid\n\n\nGrade strictly.\n\nMinimal effort is fine.",
        );
        assert_eq!(
            parts.calibration,
            Some("Excellent (9/10): Perfect\n\nAdequate (7/10): Solid")
        );
        assert_eq!(
            parts.overrides,
            Some("Grade strictly.\n\nMinimal effort is fine.")
        );
    }

    #[test]
    fn calibration_only_has_no_override() {
        let parts =
            extract_custom_instructions("SCORING CALIBRATION:\nExcellent: A\n\nMinimal: D\n\n");
        assert_eq!(parts.calibration, Some("Excellent: A\n\nMinimal: D"));
        assert_eq!(parts.overrides, None);
    }

    #[test]
    fn embedded_instructions_need_text_after_the_marker() {
        assert_eq!(
            split_embedded_instructions("Q \n\nADDITIONAL GRADING INSTRUCTIONS:\n Be kind \n"),
            Some(("Q", "Be kind"))
        );
        assert_eq!(
            split_embedded_instructions("Q\n\nADDITIONAL GRADING INSTRUCTIONS:\n"),
            None
        );
        assert_eq!(split_embedded_instructions("Q"), None);
    }

    #[test]
    fn criterion_name_drops_the_points_suffix() {
        assert_eq!(criterion_name("Understanding (5 pts)"), "Understanding");
        assert_eq!(criterion_name("Detail(3PT) "), "Detail");
        assert_eq!(
            criterion_name("Understanding (5 points)"),
            "Understanding (5 points)"
        );
        assert_eq!(criterion_name("A (1 pt) B (2 pts)"), "A B (2 pts)");
    }

    #[test]
    fn scale_scores_are_right_aligned() {
        let scale = scoring_scale(None);
        assert!(scale.contains("\n 0 \u{2013} No submission or completely blank\n"));
        assert!(scale.ends_with(
            "\n10 \u{2013} Excellent: comprehensive, precise, and clearly communicated"
        ));
    }
}
