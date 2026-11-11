use super::{
    ExampleStyle, NO_PROMPT, NO_RESPONSE, SCORE_HINT, anchor_block, extract_custom_instructions,
    feedback_example, non_empty, push_calibration, push_key_concepts, push_model_response,
    push_overrides, split_embedded_instructions,
};
use crate::grading::constants::GRADING_PHILOSOPHY;
use crate::grading::js::{self, Num};
use crate::grading::types::{BatchStats, OutlierStudent, PeerResult, Rubric, ScoringAnchors};

/// How much of a peer's response is quoted, in UTF-16 code units.
const PEER_EXCERPT_UNITS: usize = 300;

/// Builds the second-pass prompt that re-grades students whose scores sat far
/// from the batch mean.
///
/// `all_results` supplies up to two similarly scored peers per student for
/// comparison; pass an empty slice to leave them out.
pub fn build_outlier_review_prompt(
    rubric: &Rubric,
    outlier_students: &[OutlierStudent],
    anchors: &ScoringAnchors,
    stats: &BatchStats,
    max_score: f64,
    all_results: &[PeerResult],
) -> String {
    let mut essay_prompt = non_empty(&rubric.essay_prompt).unwrap_or(NO_PROMPT);
    let mut custom_instructions = rubric.custom_instructions.as_deref().unwrap_or("");
    if let Some((prompt, instructions)) = split_embedded_instructions(essay_prompt) {
        essay_prompt = prompt;
        // Unlike the batch prompt, the rubric's own instructions win here.
        if custom_instructions.is_empty() {
            custom_instructions = instructions;
        }
    }
    let custom = extract_custom_instructions(custom_instructions);

    let max = Num(max_score);
    let mean = Num(stats.mean);
    let total_students = stats
        .total_students
        .map_or_else(|| "undefined".to_owned(), |n| n.to_string());

    let mut prompt = format!(
        "You are an expert grading assistant performing a SECOND-PASS REVIEW of flagged student responses. Output: JSON array only.\n\nThese students received scores that deviated more than 1 standard deviation from the batch mean. Your job is to re-evaluate each one carefully by comparing against the rubric AND against similarly-scored peers to ensure the score is accurate and consistent.\n\nBATCH CONTEXT:\n- Batch mean score: {mean}/{max}\n- Standard deviation: {}\n- Total students in batch: {total_students}\n\n",
        Num(stats.std_dev),
    );
    push_overrides(&mut prompt, custom.overrides);
    prompt += &format!(
        "GRADING PHILOSOPHY:\n{GRADING_PHILOSOPHY}\n\nMAX SCORE: {max}\n\nQUESTION/PROMPT:\n{essay_prompt}\n"
    );

    if !rubric.checklist_items.is_empty() {
        prompt.push_str("\nGRADING CHECKLIST:\n");
        for item in &rubric.checklist_items {
            if let Some(category) = non_empty(&item.category) {
                let points = item
                    .points
                    .map_or_else(|| "undefined".to_owned(), |p| Num(p).to_string());
                prompt += &format!("- {category} ({points} points)\n");
            }
            for requirement in &item.items {
                prompt += &format!("  - {requirement}\n");
            }
        }
    }
    push_key_concepts(&mut prompt, rubric);
    push_model_response(&mut prompt, rubric);

    prompt.push('\n');
    prompt += &anchor_block(anchors, max_score);
    push_calibration(&mut prompt, custom.calibration);

    fn own_prompt(student: &OutlierStudent) -> Option<&str> {
        non_empty(&student.prompt)
    }
    let has_per_student_prompts = outlier_students
        .iter()
        .any(|s| own_prompt(s).is_some_and(|p| p != essay_prompt));
    if has_per_student_prompts {
        prompt.push_str("\nIMPORTANT: Each student received the same question structure but with DIFFERENT randomized numeric values. Each student's specific question is shown below their header. Grade each student against THEIR specific values.\n");
    }

    prompt.push_str("\nSTUDENTS TO RE-EVALUATE:\n\n");
    for student in outlier_students {
        prompt += &format!("--- Student {}: {} ---\n", student.index, student.name);
        if has_per_student_prompts && let Some(question) = own_prompt(student) {
            prompt += &format!("THEIR QUESTION: {question}\n");
        }
        let response = if student.response.is_empty() {
            NO_RESPONSE
        } else {
            &student.response
        };
        prompt += &format!(
            "ORIGINAL SCORE: {}/{max}\nORIGINAL FEEDBACK: {}\nRESPONSE:\n{response}\n",
            Num(student.original_score),
            student.original_feedback,
        );
        push_peers(&mut prompt, student, all_results, max_score);
        prompt.push('\n');
    }

    let count = outlier_students.len();
    prompt += &format!(
        "\nINSTRUCTIONS:\n- Re-read each student's response carefully\n- Compare against the rubric, scoring anchors, and the batch mean ({mean})\n- If the original score seems correct, return the SAME score\n- If the original score was too high or too low, return an ADJUSTED score\n- Provide updated feedback in the same HTML format as the main batch\n\nFEEDBACK FORMAT RULE: The feedback string must contain one section for EACH numbered requirement from the GRADING CHECKLIST. Do NOT group by category. Use HTML tags: <strong> for the requirement header, <blockquote> for the student's words (or \"You did not address this.\"), <p> for your evaluation, <em> for the \"To improve\" line. Wrap all math expressions in backticks, e.g. `x^2 + 3x` or `p < 0.05`. Start the feedback with \"<p>Hi [name],</p>\" using the student's first name. Do NOT use markdown (no **bold**, no \"> quote\", no *italic*).\n\nRESPONSE FORMAT:\nYou MUST respond with a valid JSON array ONLY. No markdown, no code fences, no explanation.\n\n[\n  {{\n    \"studentIndex\": <original student index>,\n    \"score\": <{SCORE_HINT}>,\n    \"feedback\": \"<p>Hi [name],</p>{}\",\n    \"adjusted\": <true if score changed, false if kept same>\n  }}\n]\n\nFORMAT REMINDER: each \"feedback\" string MUST be HTML with <strong>/<blockquote>/<p>/<em> tags exactly as shown above. No markdown.\nCRITICAL: Return results for ALL {count} student(s) in the array.",
        feedback_example(rubric, ExampleStyle::Full),
    );

    prompt
}

/// Quotes the two peers whose scores are closest to the student's, within one
/// point.
fn push_peers(
    prompt: &mut String,
    student: &OutlierStudent,
    all_results: &[PeerResult],
    max_score: f64,
) {
    let distance = |peer: &PeerResult| (peer.score - student.original_score).abs();
    let mut peers: Vec<&PeerResult> = all_results
        .iter()
        .filter(|peer| peer.student_index != student.index && distance(peer) <= 1.0)
        .collect();
    peers.sort_by(|a, b| distance(a).total_cmp(&distance(b)));
    peers.truncate(2);
    if peers.is_empty() {
        return;
    }

    prompt.push_str("\nPEER COMPARISON (students who scored similarly — verify consistency):\n");
    for peer in peers {
        let response = non_empty(&peer.response);
        let ellipsis = if response.is_some_and(|r| js::utf16_len(r) > PEER_EXCERPT_UNITS) {
            "..."
        } else {
            ""
        };
        *prompt += &format!(
            "  [Score {}/{}]: {}{ellipsis}\n",
            Num(peer.score),
            Num(max_score),
            js::utf16_prefix(response.unwrap_or("(no response)"), PEER_EXCERPT_UNITS),
        );
    }
}
