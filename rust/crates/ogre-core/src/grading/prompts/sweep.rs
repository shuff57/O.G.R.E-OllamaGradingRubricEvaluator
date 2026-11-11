use std::collections::BTreeMap;

use super::{
    ExampleStyle, NO_RESPONSE, SCORE_FEEDBACK_CONSISTENCY_RULE, anchor_block, feedback_example,
    requirements,
};
use crate::grading::js::{self, Num};
use crate::grading::types::{
    BandPrompt, Rubric, ScoreBand, ScoringAnchors, StudentResult, StudentWork,
};

/// How much of each response the compact sweep quotes, in UTF-16 code units.
const COMPACT_EXCERPT_UNITS: usize = 150;

const RESPONSE_FORMAT_INTRO: &str = "RESPONSE FORMAT:\nReturn ONLY a JSON array — no markdown code fences (no ```json, no ```), no surrounding text or explanation. Start the response with [ and end with ]. Only include students that need a score change.";

/// Guidance that makes a sweep's `suggestedFeedback` match the
/// per-requirement HTML the main grader produces.
struct FeedbackGuidance {
    requirements_list: String,
    feedback_template: String,
    format_rule: String,
}

fn feedback_guidance(rubric: &Rubric) -> FeedbackGuidance {
    let mut requirements_list = String::new();
    if !rubric.checklist_items.is_empty() {
        requirements_list.push_str(
            "\nGRADING REQUIREMENTS (suggestedFeedback must contain one section per numbered item):\n",
        );
        for (position, requirement) in requirements(rubric).enumerate() {
            requirements_list += &format!("{}. {requirement}\n", position + 1);
        }
    }
    FeedbackGuidance {
        requirements_list,
        feedback_template: feedback_example(rubric, ExampleStyle::Full),
        format_rule: format!(
            "FEEDBACK FORMAT RULE: suggestedFeedback must contain one section for EACH numbered requirement above. Do NOT group by category. Use HTML tags: <strong> for the requirement header, <blockquote> for the student's words (or \"You did not address this.\"), <p> for your evaluation, <em> for the \"To improve\" line. Wrap math expressions in backticks, e.g. `x^2 + 3x` or `p < 0.05`. For ANY requirement that is not at full credit, include both (a) a specific reason citing the student's words or omission, and (b) a \"To improve\" line with an actionable next step. Cite a specific rubric requirement that was not met. Do NOT invent additional standards not in the rubric. Do NOT use markdown (no **bold**, no \"> quote\", no *italic*). {SCORE_FEEDBACK_CONSISTENCY_RULE}"
        ),
    }
}

fn find_student(students: &[StudentWork], index: usize) -> Option<&StudentWork> {
    students.iter().find(|s| s.index == index)
}

fn display_name(student: Option<&StudentWork>, index: usize) -> String {
    match student.map(|s| s.name.as_str()).filter(|n| !n.is_empty()) {
        Some(name) => name.to_owned(),
        None => format!("Student {index}"),
    }
}

/// Builds the one-request consistency sweep: every student's score beside a
/// short excerpt, with the AI asked to flag scores out of line with peers.
///
/// `chunk_map` gives the chunk each student index was graded in.
pub fn build_compact_sweep_prompt(
    results: &[StudentResult],
    students: &[StudentWork],
    anchors: &ScoringAnchors,
    chunk_map: &BTreeMap<usize, usize>,
    max_score: f64,
    rubric: &Rubric,
) -> String {
    let max = Num(max_score);
    let mut prompt = format!(
        "CONSISTENCY REVIEW\n\nYou previously graded these students. Review ALL scores to ensure peers with similar response quality received similar scores.\n\n{}\nSTUDENT SCORES:\n",
        anchor_block(anchors, max_score),
    );

    for result in results {
        let index = result.student_index;
        let student = find_student(students, index);
        let name = display_name(student, index);
        // The original adds 1 to a "?" placeholder, which concatenates.
        let chunk = chunk_map
            .get(&index)
            .map_or_else(|| "?1".to_owned(), |chunk| (chunk + 1).to_string());
        let response = student
            .map(|s| s.response.as_str())
            .filter(|r| !r.is_empty())
            .unwrap_or("(No response)");
        let excerpt = js::utf16_prefix(response, COMPACT_EXCERPT_UNITS).replace('\n', " ");
        prompt += &format!(
            "[#{index}] {name} | Score: {}/{max} | Chunk: {chunk} | \"{excerpt}...\"\n",
            Num(result.score),
        );
    }

    let guidance = feedback_guidance(rubric);
    prompt += &guidance.requirements_list;
    prompt += &format!(
        "\nTASK: Identify any students whose score seems inconsistent relative to peers with similar response quality. Focus especially on students near chunk boundaries or where similar-quality responses received different scores in different chunks.\n\n{}\n\n{RESPONSE_FORMAT_INTRO} Return [] if all scores look consistent.\n\n[\n  {{\n    \"studentIndex\": <number>,\n    \"currentScore\": <number>,\n    \"suggestedScore\": <number, half-points allowed e.g. 7.5>,\n    \"suggestedFeedback\": \"<p>Hi [name],</p>{}\",\n    \"reason\": \"<brief explanation of why this score should change>\"\n  }}\n]\n\nCRITICAL: Only flag genuine inconsistencies. Do NOT adjust scores just to create a smoother distribution. Be conservative — only change scores where a student's response quality clearly doesn't match their score relative to peers.",
        guidance.format_rule, guidance.feedback_template,
    );

    prompt
}

/// Builds one consistency-check prompt per score band that holds at least two
/// students. Each prompt shows the band's full responses side by side.
pub fn build_pairwise_sweep_prompts(
    results: &[StudentResult],
    students: &[StudentWork],
    anchors: &ScoringAnchors,
    max_score: f64,
    rubric: &Rubric,
) -> Vec<BandPrompt> {
    let bands = [
        (ScoreBand::High, anchors.excellent.score - 1.0, max_score),
        (
            ScoreBand::UpperMid,
            anchors.adequate.score,
            anchors.excellent.score - 1.5,
        ),
        (
            ScoreBand::LowerMid,
            anchors.below_average.score,
            anchors.adequate.score - 0.5,
        ),
        (ScoreBand::Low, 0.0, anchors.below_average.score - 0.5),
    ];
    let guidance = feedback_guidance(rubric);
    let max = Num(max_score);

    let mut prompts = Vec::new();
    for (band, low, high) in bands {
        let in_band: Vec<&StudentResult> = results
            .iter()
            .filter(|r| r.score >= low && r.score <= high)
            .collect();
        if in_band.len() < 2 {
            continue;
        }

        let label = band.label();
        let mut prompt = format!(
            "PAIRWISE CONSISTENCY CHECK — {label} Score Band ({}–{}/{max})\n\nThese students all scored in the {} range. Review their full responses and determine if the scores are internally consistent.\n\n{}{}\nSTUDENTS IN THIS BAND:\n",
            Num(low),
            Num(high),
            label.to_lowercase(),
            anchor_block(anchors, max_score),
            guidance.requirements_list,
        );

        for result in &in_band {
            let index = result.student_index;
            let student = find_student(students, index);
            let response = student
                .map(|s| s.response.as_str())
                .filter(|r| !r.is_empty())
                .unwrap_or(NO_RESPONSE);
            prompt += &format!(
                "\n--- [#{index}] {} | Score: {}/{max} ---\n{response}\n",
                display_name(student, index),
                Num(result.score),
            );
        }

        prompt += &format!(
            "\nTASK: Are these scores consistent with each other? If students gave responses of similar quality but received different scores, flag them for adjustment.\n\n{}\n\n{RESPONSE_FORMAT_INTRO} Return [] if all scores look consistent within this band.\n\n[\n  {{\n    \"studentIndex\": <number>,\n    \"currentScore\": <number>,\n    \"suggestedScore\": <number, half-points allowed e.g. 7.5>,\n    \"suggestedFeedback\": \"<p>Hi [name],</p>{}\",\n    \"reason\": \"<brief explanation>\"\n  }}\n]\n\nBe conservative — only adjust genuine inconsistencies.",
            guidance.format_rule, guidance.feedback_template,
        );

        prompts.push(BandPrompt {
            band,
            label: label.to_owned(),
            prompt,
            student_indices: in_band.iter().map(|r| r.student_index).collect(),
        });
    }
    prompts
}
