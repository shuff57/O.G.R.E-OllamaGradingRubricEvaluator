use std::sync::LazyLock;

use regex::Regex;

use super::{
    CONCEPTUAL_THOROUGHNESS_RULE, ExampleStyle, FEEDBACK_FORMAT_RULE, NO_PROMPT, NO_RESPONSE,
    PARTIAL_CREDIT_RULE, SCORE_FEEDBACK_CONSISTENCY_RULE, SCORE_HINT, VIRTUAL_MAX, criterion_names,
    extract_custom_instructions, feedback_example, non_empty, push_calibration,
    push_category_weights, push_key_concepts, push_model_response, push_overrides,
    push_requirements, scoring_scale, split_embedded_instructions,
};
use crate::grading::constants::GRADING_PHILOSOPHY;
use crate::grading::js::{self, Num};
use crate::grading::types::{
    Anchor, BridgeResponse, CalibrationExample, CalibrationExamples, GradingError, Rubric,
    ScoringAnchors, StudentWork,
};
use crate::grading::{NUMBER, pattern};

/// A response that meets every criterion scores at least this, out of 10.
const SCORE_FLOOR: u8 = 8;
/// How much of a graded example's feedback is quoted, in UTF-16 code units.
const FEEDBACK_EXCERPT_UNITS: usize = 300;

static NUMBERS: LazyLock<Regex> = LazyLock::new(|| pattern(NUMBER));

/// Builds the prompt that grades a chunk of students in one request.
///
/// `bridge_responses` are graded examples from an earlier chunk and
/// `calibration_examples` are examples from earlier sessions; both keep the
/// scoring standard steady. Fails if a checklist item has no category.
pub fn build_batch_prompt(
    rubric: &Rubric,
    students: &[StudentWork],
    anchors: &ScoringAnchors,
    bridge_responses: Option<&[BridgeResponse]>,
    calibration_examples: Option<&CalibrationExamples>,
) -> Result<String, GradingError> {
    let criteria = criterion_names(rubric)?;
    let score_factor = f64::from(VIRTUAL_MAX) / rubric.max_score_value();
    let on_virtual_scale = |score: f64| Num(js::round_to(score * score_factor, 10.0));

    let mut essay_prompt = non_empty(&rubric.essay_prompt).unwrap_or(NO_PROMPT);
    let mut custom_instructions = rubric.custom_instructions.as_deref().unwrap_or("");
    if let Some((prompt, instructions)) = split_embedded_instructions(essay_prompt) {
        essay_prompt = prompt;
        custom_instructions = instructions;
    }
    let custom = extract_custom_instructions(custom_instructions);

    let mut prompt = String::from(
        "You are an expert grading assistant. Grade ALL students in this batch against the provided rubric. Output: JSON array only.\n\n",
    );
    push_overrides(&mut prompt, custom.overrides);
    prompt += &format!(
        "GRADING PHILOSOPHY:\n{GRADING_PHILOSOPHY}\n\nMAX SCORE: {VIRTUAL_MAX}\n\nQUESTION/PROMPT:\n{essay_prompt}\n"
    );

    if !rubric.checklist_items.is_empty() {
        push_requirements(&mut prompt, rubric);
        prompt += &format!(
            "\n{PARTIAL_CREDIT_RULE} For 5-point categories, map bands roughly as: 1-2 pts (20-40%), 2-3 pts (40-60%), 3-4 pts (60-80%); reserve 4-5 pts for essentially complete/correct coverage.\n\n{CONCEPTUAL_THOROUGHNESS_RULE}\n"
        );
    }
    push_category_weights(&mut prompt, rubric);
    push_criterion_weights(&mut prompt, rubric);
    push_key_concepts(&mut prompt, rubric);
    push_model_response(&mut prompt, rubric);

    let anchor_line = |label: &str, anchor: &Anchor| {
        format!(
            "- {label} ({}/{VIRTUAL_MAX}): {}\n",
            on_virtual_scale(anchor.score),
            anchor.description
        )
    };
    prompt += &format!(
        "\nSCORING ANCHORS (use these as calibration references):\n{}{}{}{}\nCompare each student response to these anchors to ensure consistency.\n\n{}\n\n\n",
        anchor_line("Excellent", &anchors.excellent),
        anchor_line("Adequate", &anchors.adequate),
        anchor_line("Below Average", &anchors.below_average),
        anchor_line("Minimal", &anchors.minimal),
        scoring_scale(None),
    );

    let floor = SCORE_FLOOR;
    prompt += &format!(
        "\nCRITICAL: A response that correctly hits every rubric criterion earns {floor}-{}, REGARDLESS of length.\nA short, accurate answer scores higher than a long, partially-wrong one.\nOnly drop below {floor} if a rubric criterion is genuinely missing or incorrect — NOT merely brief.\nThis {floor}+ rule applies only when ALL rubric criteria are substantively addressed — brevity cannot compensate for missing sub-criteria.\nScore {floor} requires all rubric criteria to be substantively correct; score {} when one criterion is only partially met or missing a key element — but if conceptual understanding is demonstrated, score {} not {}.\n",
        (floor + 1).min(10),
        floor - 1,
        floor - 1,
        floor - 2,
    );
    push_calibration(&mut prompt, custom.calibration);

    if let Some(bridges) = bridge_responses.filter(|b| !b.is_empty()) {
        push_bridge_examples(&mut prompt, bridges, &on_virtual_scale);
    }
    if let Some(examples) = calibration_examples.filter(|e| e.total > 0.0) {
        push_historical_examples(&mut prompt, examples, &on_virtual_scale);
    }

    // Sites that randomize values give each student a different question.
    fn own_prompt(student: &StudentWork) -> Option<&str> {
        non_empty(&student.prompt)
    }
    let has_per_student_prompts = students
        .iter()
        .any(|s| own_prompt(s).is_some_and(|p| p != essay_prompt));
    if has_per_student_prompts {
        prompt.push_str("\nIMPORTANT: Each student received the same question structure but with DIFFERENT randomized numeric values. Each student's specific question is shown below their header. Grade each student against THEIR specific values, not the shared prompt above.\n");
    }

    prompt.push_str("\nSTUDENTS TO GRADE:\n\n");
    for student in students {
        prompt += &format!("--- Student {}: {} ---\n", student.index, student.name);
        if has_per_student_prompts && let Some(question) = own_prompt(student) {
            prompt += &format!("THEIR QUESTION: {question}\n");
        }
        let response = Some(student.response.as_str())
            .filter(|r| !r.is_empty())
            .unwrap_or(NO_RESPONSE);
        prompt += &format!("{response}\n\n");
    }

    // Chain-of-rubric: the AI records a 0-10 score per category and the
    // parser applies the category weights.
    let criterion_scores = if criteria.is_empty() {
        String::new()
    } else {
        let fields: Vec<String> = criteria
            .iter()
            .map(|name| format!("\"{name}\": <0-10>"))
            .collect();
        format!("    \"criterion_scores\": {{{}}},\n", fields.join(", "))
    };
    // The template shows real student indices so the AI does not guess them.
    let first_index = students.first().map_or(0, |s| s.index);
    let second_index = students.get(1).map_or(first_index + 1, |s| s.index);
    let count = students.len();

    prompt.push('\n');
    if !criteria.is_empty() {
        prompt.push_str("GRADING PROCESS:\nFor each student: (1) score each category independently using the PARTIAL CREDIT RULE above, (2) record category scores in criterion_scores, (3) sum for the final score. Do NOT adjust scores to hit a desired total.\n");
    }
    prompt += &format!(
        "\n\n{FEEDBACK_FORMAT_RULE}\n\n{SCORE_FEEDBACK_CONSISTENCY_RULE}\n\n[\n  {{\n    \"studentIndex\": {first_index},\n    {criterion_scores}    \"score\": <{SCORE_HINT}>\n    \"feedback\": \"<p>Hi [name],</p>{}\"\n  }},\n  {{\n    \"studentIndex\": {second_index},\n    {criterion_scores}    \"score\": <{SCORE_HINT}>\n    \"feedback\": \"<same format — one section per requirement>\"\n  }}\n  // ... continue for all {count} students\n]\n\nCRITICAL: Return results for ALL {count} students. Use the studentIndex from each \"--- Student N:\" header.\n\nFORMAT REMINDER: each \"feedback\" string MUST be HTML with <strong>/<blockquote>/<p>/<em> tags exactly as shown in the template above. Do NOT use markdown (no **bold**, no \"> quote\", no *italic*).",
        feedback_example(rubric, ExampleStyle::Full),
    );

    Ok(prompt)
}

fn push_criterion_weights(prompt: &mut String, rubric: &Rubric) {
    let Some(weights) = rubric.criterion_weights.as_ref().filter(|w| !w.is_empty()) else {
        return;
    };
    prompt.push_str(
        "\nCRITERION WEIGHTS (within each category, criteria percentages must sum to 100%):\n",
    );
    for (category, criteria) in weights.iter() {
        *prompt += &format!("- {category}:\n");
        for (criterion, percent) in criteria.iter() {
            *prompt += &format!("  - {criterion}: {}%\n", Num(*percent));
        }
    }
    prompt.push_str(
        "Weight each criterion proportionally within its category. These weights will be applied automatically.\n",
    );
}

fn push_bridge_examples(
    prompt: &mut String,
    bridges: &[BridgeResponse],
    on_virtual_scale: &dyn Fn(f64) -> Num,
) {
    prompt.push_str(
        "\nCALIBRATION EXAMPLES (from previously graded batch — you MUST match this scoring standard):\n",
    );

    let mut tiers: Vec<(String, Vec<&BridgeResponse>)> = Vec::new();
    for bridge in bridges {
        let tier = non_empty(&bridge.tier).unwrap_or("other");
        match tiers.iter_mut().find(|(name, _)| name == tier) {
            Some((_, examples)) => examples.push(bridge),
            None => tiers.push((tier.to_owned(), vec![bridge])),
        }
    }

    for (tier, examples) in js::object_order(tiers) {
        let label = match tier.as_str() {
            "excellent" => "HIGH QUALITY".to_owned(),
            "adequate" => "AVERAGE QUALITY".to_owned(),
            "belowAverage" => "BELOW AVERAGE".to_owned(),
            "minimal" => "LOW QUALITY".to_owned(),
            "spread" => "REFERENCE".to_owned(),
            other => other.to_uppercase(),
        };
        *prompt += &format!("\n{label}:\n");
        for bridge in examples {
            let name = match non_empty(&bridge.name) {
                Some(name) => name.to_owned(),
                None => format!("Student {}", bridge.student_index),
            };
            // Numbers are masked so one student's values are not carried
            // into another student's evaluation; the tone still calibrates.
            let excerpt = js::utf16_prefix(&bridge.feedback, FEEDBACK_EXCERPT_UNITS);
            let scrubbed = NUMBERS.replace_all(&excerpt, "[N]");
            *prompt += &format!(
                "  - \"{name}\" = {}/{VIRTUAL_MAX}: {scrubbed}\n",
                on_virtual_scale(bridge.score)
            );
        }
    }

    prompt.push_str("\nCONSISTENCY RULES:\n- A response of SIMILAR quality to a calibration example MUST receive a SIMILAR score (within 1 point).\n- A response BETTER than the \"high quality\" examples should score the same or higher.\n- A response WORSE than the \"low quality\" examples should score the same or lower.\n- Score distribution should be comparable to the previous batch.\n");
}

fn push_historical_examples(
    prompt: &mut String,
    examples: &CalibrationExamples,
    on_virtual_scale: &dyn Fn(f64) -> Num,
) {
    prompt.push_str("\nHISTORICAL CALIBRATION EXAMPLES (from previous grading sessions with similar rubrics \u{2014} use to calibrate your scoring standard):\n");
    let tiers: [(&Option<CalibrationExample>, &str); 3] = [
        (&examples.excellent, "HIGH QUALITY"),
        (&examples.adequate, "AVERAGE QUALITY"),
        (&examples.minimal, "LOW QUALITY"),
    ];
    for (example, label) in tiers {
        if let Some(example) = example {
            *prompt += &format!(
                "\n{label}:\n  - \"[STUDENT]\" = {}/{VIRTUAL_MAX}: {}\n",
                on_virtual_scale(example.grading_score),
                js::utf16_prefix(&example.feedback, FEEDBACK_EXCERPT_UNITS),
            );
        }
    }
    prompt.push_str("\nHISTORICAL CONSISTENCY RULES:\n- Use these historical examples to understand the scoring standard applied in past sessions.\n- A response of similar quality to a historical HIGH QUALITY example should score similarly.\n- These examples supplement (do not replace) the SCORING ANCHORS and CALIBRATION EXAMPLES above.\n");
}
