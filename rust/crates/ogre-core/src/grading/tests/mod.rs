//! The JavaScript grading server's test suite, ported file by file, plus a
//! differential test against the JavaScript itself.
//!
//! Each ported module keeps the original's test names as comments. Where the
//! original relied on dynamic typing, or asserts something the current
//! JavaScript no longer does, the test notes how it was adapted.

mod chat_test;
mod golden;
mod grading_test;
mod grading_weights_test;
mod prompts_test;

use super::*;

fn rubric(json: &str) -> Rubric {
    serde_json::from_str(json).expect("fixture rubric is valid JSON")
}

fn student(index: usize, name: &str, response: &str) -> StudentWork {
    StudentWork {
        index,
        name: name.to_owned(),
        response: response.to_owned(),
        prompt: None,
    }
}

fn result(student_index: usize, score: f64, feedback: &str) -> StudentResult {
    StudentResult {
        student_index,
        score,
        feedback: feedback.to_owned(),
    }
}

fn anchors(
    excellent: (f64, &str),
    adequate: (f64, &str),
    below: (f64, &str),
    minimal: (f64, &str),
) -> ScoringAnchors {
    let anchor = |(score, description): (f64, &str)| Anchor {
        score,
        description: description.to_owned(),
    };
    ScoringAnchors {
        excellent: anchor(excellent),
        adequate: anchor(adequate),
        below_average: anchor(below),
        minimal: anchor(minimal),
    }
}

/// `buildBatchPrompt(rubric, students, anchors)`.
fn batch_prompt(rubric: &Rubric, students: &[StudentWork], anchors: &ScoringAnchors) -> String {
    build_batch_prompt(rubric, students, anchors, None, None).expect("every category is named")
}

/// `buildSingleGradePrompt(rubric, work, instructions)`.
fn single_prompt(rubric: &Rubric, work: &str, instructions: &str) -> String {
    build_single_grade_prompt(rubric, work, instructions, None).expect("every category is named")
}

/// `parseSingleGradeResponse(response, maxScore)`.
fn parse_single(response: &str, max_score: f64) -> SingleGrade {
    parse_single_grade_response(response, max_score, None, None)
}

/// `JSON.stringify` of a string.
fn json_string(text: &str) -> String {
    serde_json::to_string(text).expect("strings always serialize")
}

/// The text from `SCORING BY CATEGORY` to the next blank line, which is what
/// the original's lookahead regex captures for these prompts.
fn scoring_section(prompt: &str) -> &str {
    let Some(start) = prompt.find("SCORING BY CATEGORY") else {
        return "";
    };
    let section = &prompt[start..];
    &section[..section.find("\n\n").unwrap_or(section.len())]
}
