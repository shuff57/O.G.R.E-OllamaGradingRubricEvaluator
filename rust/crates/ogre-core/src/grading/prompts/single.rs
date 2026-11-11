use super::{
    CONCEPTUAL_THOROUGHNESS_RULE, ExampleStyle, FEEDBACK_FORMAT_RULE, NO_PROMPT, NO_RESPONSE,
    PARTIAL_CREDIT_RULE, SCORE_FEEDBACK_CONSISTENCY_RULE, SCORE_HINT, VIRTUAL_MAX, criterion_names,
    extract_custom_instructions, feedback_example, non_empty, push_calibration,
    push_category_weights, push_key_concepts, push_model_response, push_overrides,
    push_requirements, scoring_scale,
};
use crate::grading::constants::GRADING_PHILOSOPHY;
use crate::grading::js::{self, Num};
use crate::grading::types::{ChecklistItem, GradingConstants, GradingError, Rubric, WeightMode};

/// Builds the prompt that grades one student's work.
///
/// `instructions` is a message from the teacher for this one grading, and
/// `constants` replaces the built-in philosophy and scoring scale. Fails if a
/// checklist item has no category.
pub fn build_single_grade_prompt(
    rubric: &Rubric,
    student_work: &str,
    instructions: &str,
    constants: Option<&GradingConstants>,
) -> Result<String, GradingError> {
    let criteria = criterion_names(rubric)?;
    let essay_prompt = non_empty(&rubric.essay_prompt).unwrap_or(NO_PROMPT);
    let custom = extract_custom_instructions(rubric.custom_instructions.as_deref().unwrap_or(""));
    let philosophy = constants
        .and_then(|c| c.grading_philosophy.as_deref())
        .unwrap_or(GRADING_PHILOSOPHY);
    let scale = constants.and_then(|c| c.scoring_scale_descriptors.as_deref());

    let mut prompt = String::from(
        "You are an expert grading assistant. Grade this student's work against the provided rubric. Output: JSON object only.\n\n",
    );
    push_overrides(&mut prompt, custom.overrides);
    prompt += &format!(
        "GRADING PHILOSOPHY:\n{philosophy}\n\nMAX SCORE: {VIRTUAL_MAX}\n\nQUESTION/PROMPT:\n{essay_prompt}\n"
    );

    if !rubric.checklist_items.is_empty() {
        push_requirements(&mut prompt, rubric);
        prompt += &format!("\n{PARTIAL_CREDIT_RULE}\n\n{CONCEPTUAL_THOROUGHNESS_RULE}\n");
    }
    push_category_weights(&mut prompt, rubric);
    push_key_concepts(&mut prompt, rubric);
    push_model_response(&mut prompt, rubric);

    prompt += &format!("\n{}\n", scoring_scale(scale));
    push_calibration(&mut prompt, custom.calibration);

    let work = if student_work.is_empty() {
        NO_RESPONSE
    } else {
        student_work
    };
    prompt += &format!("\nSTUDENT WORK:\n{work}\n");
    if !instructions.is_empty() {
        prompt += &format!("\nADDITIONAL INSTRUCTIONS:\n{instructions}\n");
    }

    // The AI sees each category's points with any weight already applied,
    // never the raw weights.
    let criterion_scores = if criteria.is_empty() {
        String::new()
    } else {
        let fields: Vec<String> = criteria
            .iter()
            .zip(&rubric.checklist_items)
            .map(|(name, item)| {
                format!(
                    "\"{name}\": <0-{} pts>",
                    Num(effective_points(item, rubric))
                )
            })
            .collect();
        format!("  \"criterion_scores\": {{{}}},\n", fields.join(", "))
    };

    prompt.push('\n');
    if !criteria.is_empty() {
        prompt.push_str("GRADING PROCESS: Score each category independently using the PARTIAL CREDIT RULE, then sum for the final score.\n");
    }
    prompt += &format!(
        "\n{FEEDBACK_FORMAT_RULE}\n\n{SCORE_FEEDBACK_CONSISTENCY_RULE}\n\nRESPONSE FORMAT:\nReturn ONLY valid JSON. No markdown code fences. No explanation text.\n\n{{\n{criterion_scores}  \"score\": <{SCORE_HINT}>\n  \"feedback\": \"<p>Hi [name],</p>{}\"\n}}\n\nFORMAT REMINDER: the \"feedback\" string MUST be HTML with <strong>/<blockquote>/<p>/<em> tags exactly as shown above. Do NOT use markdown (no **bold**, no \"> quote\", no *italic*).",
        feedback_example(rubric, ExampleStyle::Brief),
    );

    Ok(prompt)
}

/// A category's points after the rubric's weight mode is applied.
fn effective_points(item: &ChecklistItem, rubric: &Rubric) -> f64 {
    let base = match item.points {
        Some(points) if points > 0.0 => points,
        _ => rubric.max_score_value(),
    };
    let weight = match rubric.weight_mode {
        Some(WeightMode::Category) => item.category_weight,
        Some(WeightMode::Criterion) => item.criterion_weight,
        _ => None,
    };
    match weight {
        Some(weight) => js::round_to(base * (weight / 100.0), 10.0),
        None => base,
    }
}
