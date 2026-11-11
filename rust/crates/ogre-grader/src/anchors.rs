//! AI-written example answers at each scoring anchor, which the teacher can
//! edit and send along with a batch as calibration.

use ogre_core::{Rubric, ScoringAnchors, generate_scoring_anchors};
use ogre_llm::{ChatProvider, ChatRequest, Message};
use regex::Regex;

use crate::error::GraderError;
use crate::text::{JS_WHITESPACE_CLASS, js_number, js_trim};

/// The leniency setting that means "standard": no tone guidance is added.
const STANDARD_LENIENCY: f64 = 50.0;

/// An example student answer at one anchor.
#[derive(Debug, Clone, PartialEq)]
pub struct AnchorExample {
    /// "Excellent", "Adequate", "Below Average" or "Minimal".
    pub label: String,
    pub score: f64,
    pub max_score: f64,
    /// The example answer. Empty if the AI's reply had no section for this
    /// anchor.
    pub response: String,
}

/// Asks the AI for an example answer at each of the rubric's four anchors.
///
/// `leniency` runs from 0 (most lenient) to 100 (most strict); `None` and 50
/// leave the tone alone.
pub async fn generate_anchor_examples(
    provider: &dyn ChatProvider,
    rubric: &Rubric,
    leniency: Option<f64>,
) -> Result<Vec<AnchorExample>, GraderError> {
    let anchors = generate_scoring_anchors(rubric);
    let prompt = build_anchor_generation_prompt(rubric, &anchors, leniency);
    let reply = provider
        .chat(&ChatRequest::new([Message::user(prompt)]))
        .await?;
    Ok(parse_anchor_responses(
        &reply,
        &anchors,
        rubric.max_score_value(),
    ))
}

/// The custom instructions that carry anchor examples into a batch: put the
/// result in [`Rubric::custom_instructions`]. `None` if there is nothing to
/// send.
pub fn calibration_instructions(examples: &[AnchorExample]) -> Option<String> {
    let text = examples
        .iter()
        .map(|example| format!("{}: {}", example.label, example.response))
        .collect::<Vec<_>>()
        .join("\n\n");
    let text = js_trim(&text);
    (!text.is_empty()).then(|| format!("SCORING CALIBRATION:\n{text}"))
}

/// Builds the prompt that asks for one example answer per anchor.
pub fn build_anchor_generation_prompt(
    rubric: &Rubric,
    anchors: &ScoringAnchors,
    leniency: Option<f64>,
) -> String {
    let max = js_number(rubric.max_score_value());
    let filled = |text: &Option<String>| text.clone().filter(|t| !t.is_empty());

    let mut parts: Vec<String> = vec![
        "You are a grading calibration assistant.".to_owned(),
        "For the assignment below, write FOUR brief example student responses at different quality levels.".to_owned(),
        "These examples will be shown to an AI grader so it understands what each score level looks like for THIS specific question.\n".to_owned(),
    ];

    if let Some(leniency) = leniency.filter(|&l| l != STANDARD_LENIENCY) {
        if leniency < STANDARD_LENIENCY {
            let percent = js_number(STANDARD_LENIENCY - leniency);
            parts.push(format!(
                "CRITICAL — LENIENT GRADING MODE ({percent}% more lenient than standard):\nThe teacher has chosen lenient grading. Your example responses MUST reflect how a LENIENT teacher would grade. This means:\n\n- EXCELLENT: Complete and correct, but does NOT need to show every step or use formal notation. A clear, concise answer that covers all concepts counts as excellent.\n- ADEQUATE: Gets the main ideas right using everyday language. May skip steps, use informal phrasing like \"I subtracted them\" instead of writing formulas. This is STILL adequate under lenient grading.\n- BELOW AVERAGE: Shows they understood the general concept but is vague or incomplete. Does NOT write formulas or show calculations — just states results or describes the process in words. Example: \"The IQR is 16 and the max is way above the fence so it's an outlier.\"\n- MINIMAL: Barely engages. Might just state a conclusion without any reasoning. Example: \"80 is an outlier because it's really high.\"\n\nDO NOT write formula-heavy responses for Below Average or Minimal tiers. A lenient Below Average response should look like what a struggling student actually writes — short, imprecise, but showing they tried.\n"
            ));
        } else {
            let percent = js_number(leniency - STANDARD_LENIENCY);
            parts.push(format!(
                "CRITICAL — STRICT GRADING MODE ({percent}% more strict than standard):\nThe teacher has chosen strict grading. Your example responses MUST reflect how a STRICT teacher would grade. This means:\n\n- EXCELLENT: Flawless — exact formulas with proper notation, every step shown, precise terminology, complete logical chain, thorough contextual analysis.\n- ADEQUATE: Complete and correct but may have minor presentation gaps. Still shows all formulas and key steps.\n- BELOW AVERAGE: Shows partial knowledge — gets some formulas right but misses key steps or makes errors. Under strict grading this is NOT adequate.\n- MINIMAL: Very incomplete — may state a result without showing work, or show only one part of a multi-step problem.\n"
            ));
        }
    }

    if let Some(essay_prompt) = filled(&rubric.essay_prompt) {
        parts.push(format!("ASSIGNMENT:\n{essay_prompt}\n"));
    }

    let checklist = rubric
        .checklist_items
        .iter()
        .map(|item| (&item.category, &item.items));
    let concepts = rubric
        .rubric_items
        .iter()
        .map(|item| (&item.category, &item.items));
    let mut rubric_lines: Vec<String> = Vec::new();
    for (category, items) in checklist.chain(concepts) {
        if let Some(category) = filled(category) {
            rubric_lines.push(format!("[{category}]"));
        }
        rubric_lines.extend(items.iter().map(|item| format!("  - {item}")));
    }
    if !rubric_lines.is_empty() {
        parts.push(format!("RUBRIC:\n{}\n", rubric_lines.join("\n")));
    }
    if let Some(model_text) = filled(&rubric.model_text) {
        parts.push(format!("MODEL ANSWER:\n{model_text}\n"));
    }
    parts.push(format!("MAX SCORE: {max}\n"));

    parts.push("Write one realistic example student response per level. Match the length and style a student would actually write for this assignment.\n".to_owned());
    let tiers = tiers(anchors);
    for (position, (label, score)) in tiers.iter().enumerate() {
        let gap = if position + 1 < tiers.len() { "\n" } else { "" };
        parts.push(format!(
            "{} ({}/{max}):\n[write example]{gap}",
            label.to_uppercase(),
            js_number(*score)
        ));
    }

    parts.join("\n")
}

/// Splits the AI's reply into its four sections. Each section starts at a
/// header such as "Excellent (9/10):" and runs to the next later tier's
/// header, or to the end.
pub fn parse_anchor_responses(
    text: &str,
    anchors: &ScoringAnchors,
    max_score: f64,
) -> Vec<AnchorExample> {
    let tiers = tiers(anchors);
    // As in the grading server, the numbers go into the pattern as they are,
    // so the dot in "3.8" matches any character.
    let header = |label: &str, score: f64| {
        format!(
            r"(?i){}{JS_WHITESPACE_CLASS}*\({}/{}\)",
            label.replace(' ', &format!("{JS_WHITESPACE_CLASS}+")),
            js_number(score),
            js_number(max_score),
        )
    };

    tiers
        .iter()
        .enumerate()
        .map(|(position, &(label, score))| {
            let start = Regex::new(&format!("{}{JS_WHITESPACE_CLASS}*:?", header(label, score)))
                .ok()
                .and_then(|pattern| pattern.find(text))
                .map(|found| found.end());
            let response = start.map_or("", |start| {
                let rest = &text[start..];
                let end = tiers[position + 1..]
                    .iter()
                    .find_map(|&(next_label, next_score)| {
                        Regex::new(&header(next_label, next_score))
                            .ok()?
                            .find(rest)
                            .map(|found| found.start())
                    })
                    .unwrap_or(rest.len());
                js_trim(&rest[..end])
            });
            AnchorExample {
                label: label.to_owned(),
                score,
                max_score,
                response: response.to_owned(),
            }
        })
        .collect()
}

fn tiers(anchors: &ScoringAnchors) -> [(&'static str, f64); 4] {
    [
        ("Excellent", anchors.excellent.score),
        ("Adequate", anchors.adequate.score),
        ("Below Average", anchors.below_average.score),
        ("Minimal", anchors.minimal.score),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example(label: &str, response: &str) -> AnchorExample {
        AnchorExample {
            label: label.to_owned(),
            score: 0.0,
            max_score: 10.0,
            response: response.to_owned(),
        }
    }

    #[test]
    fn calibration_instructions_carry_every_tier() {
        let examples = [example("Excellent", "All of it."), example("Minimal", "")];
        assert_eq!(
            calibration_instructions(&examples).as_deref(),
            Some("SCORING CALIBRATION:\nExcellent: All of it.\n\nMinimal:")
        );
        assert_eq!(calibration_instructions(&[]), None);
    }
}
