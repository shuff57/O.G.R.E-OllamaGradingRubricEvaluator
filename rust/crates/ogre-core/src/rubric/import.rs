//! Reading a rubric from a picture of a page.
//!
//! The prompt and the reply reader are the desktop app's
//! (`RUBRIC_EXTRACTION_PROMPT` and `parseRubricExtractionResponse` in
//! `lib/discover.ts`). What is done with the criteria afterwards is not: the
//! desktop app saved them to its library as one line each, where their points
//! were shown and never counted. Here each criterion becomes a category whose
//! weight is its share of the points, which is what the points on a rubric
//! mean.

use std::sync::LazyLock;

use regex::Regex;

use super::criteria::{MODEL_RESPONSE_MARKER, RubricCriterion, proportional_shares};
use crate::grading::js::{Json, Num};

/// The system prompt that asks for the criteria in a picture.
pub const RUBRIC_FROM_IMAGE_SYSTEM_PROMPT: &str = r#"You are a data extraction assistant.
Extract grading rubric criteria from the provided image.

RULES:
- Extract EVERY criterion visible in the image.
- Points values MUST be numbers (integers or decimals), not strings.
- If points are shown as ranges (e.g., "0-5"), use the maximum value.
- If no point values are visible, estimate reasonable values that sum to 100.
- If the rubric covers multiple questions, tag each criterion with its question number.
- For single-question rubrics, omit the "question" field.
- If you can identify a title or assignment name, include it as "suggestedName".
- Keep descriptions concise but complete (1-2 sentences).

EXAMPLE:
Input rubric text: "Writing Quality (10 pts): Clear grammar, style, and organization. Argument Strength (15 pts): Thesis is supported with evidence and logical reasoning. Question 2 - Analysis (5 pts): Correctly identifies key themes."

Expected output:
{
  "suggestedName": "",
  "rubric": [
    { "criteria": "Writing Quality", "description": "Clear grammar, style, and organization", "points": 10 },
    { "criteria": "Argument Strength", "description": "Thesis is supported with evidence and logical reasoning", "points": 15 },
    { "criteria": "Analysis", "description": "Correctly identifies key themes", "points": 5, "question": 2 }
  ]
}

Return ONLY a valid JSON object with this structure:
{
  "suggestedName": "Assignment or Rubric Title (or empty string)",
  "rubric": [
    { "criteria": "Criteria Name", "description": "What this criterion evaluates", "points": 5 },
    { "criteria": "Another Criterion", "description": "Description here", "points": 10, "question": 2 }
  ]
}
Do not include markdown formatting, code fences, or explanations outside the JSON."#;

/// The user message that goes with the picture.
pub const RUBRIC_FROM_IMAGE_USER_PROMPT: &str = "Extract the grading rubric from this screenshot image. Return structured JSON with all criteria, point values, and descriptions.";

/// A rubric the AI read from a picture.
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedRubric {
    /// A title the AI found for it. May be empty.
    pub suggested_name: String,
    /// At least one criterion, each with a name.
    pub criteria: Vec<RubricCriterion>,
}

/// Why a reply held no rubric.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ExtractionError {
    #[error("the AI's reply was not the list of criteria that was asked for")]
    NotJson,
    #[error("the AI found no rubric criteria")]
    NoCriteria,
}

static THINKING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<think>.*?</think>").expect("pattern is valid"));
static JSON_FENCE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)```json\s*(.*?)\s*```").expect("pattern is valid"));
static ANY_FENCE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)```\s*(.*?)\s*```").expect("pattern is valid"));
static RUBRIC_OBJECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?s)\{.*"rubric".*\}"#).expect("pattern is valid"));

/// Reads the AI's reply to [`RUBRIC_FROM_IMAGE_SYSTEM_PROMPT`].
///
/// Tolerates what models do around JSON: a thinking block before it, code
/// fences, text on either side, and points given as text. A criterion
/// without a name is dropped.
pub fn parse_rubric_extraction(ai_text: &str) -> Result<ExtractedRubric, ExtractionError> {
    let without_thinking = THINKING.replace_all(ai_text.trim(), "");
    let mut text = without_thinking.trim();
    if let Some(fenced) = JSON_FENCE
        .captures(text)
        .or_else(|| ANY_FENCE.captures(text))
        .and_then(|found| found.get(1))
    {
        text = fenced.as_str().trim();
    }

    let parsed = Json::parse(text)
        .or_else(|| Json::parse(RUBRIC_OBJECT.find(text)?.as_str()))
        .filter(|parsed| matches!(parsed, Json::Object(_)))
        .ok_or(ExtractionError::NotJson)?;

    let Json::Array(rows) = parsed.get("rubric") else {
        return Err(ExtractionError::NoCriteria);
    };
    let criteria: Vec<RubricCriterion> = rows.iter().filter_map(criterion).collect();
    if criteria.is_empty() {
        return Err(ExtractionError::NoCriteria);
    }
    Ok(ExtractedRubric {
        suggested_name: words(parsed.get("suggestedName")),
        criteria,
    })
}

fn criterion(row: &Json) -> Option<RubricCriterion> {
    if !matches!(row, Json::Object(_)) {
        return None;
    }
    let field = |name: &str| words(row.get(name));
    let name = Some(field("criteria"))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| field("name"));
    if name.is_empty() {
        return None;
    }
    // A number, or text that starts with one, as `parseFloat` reads it.
    let number = |value: &Json| Some(value.parse_float()).filter(|number| number.is_finite());
    Some(RubricCriterion {
        criteria: name,
        description: field("description"),
        points: number(row.get("points")).unwrap_or(0.0),
        question: number(row.get("question"))
            .filter(|question| *question >= 1.0)
            .map(f64::trunc),
        ..RubricCriterion::default()
    })
}

/// A value as trimmed text on one line. Nothing for null, lists and objects.
fn words(value: &Json) -> String {
    let text = match value {
        Json::String(_) | Json::Number(_) => value.to_js_string(),
        _ => String::new(),
    };
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Criteria read from a picture, as rubric text for the teacher's editor.
///
/// Each criterion is a category with one requirement: its description, or
/// its name where it has none. When every criterion has points, each
/// category's weight is its share of them. A rubric that covers several
/// questions names the question in each category.
pub fn imported_rubric_text(criteria: &[RubricCriterion]) -> String {
    let mut questions: Vec<f64> = criteria.iter().filter_map(|c| c.question).collect();
    questions.dedup();
    questions.sort_by(f64::total_cmp);
    questions.dedup();
    let several_questions = questions.len() > 1;

    let mut categories: Vec<String> = Vec::with_capacity(criteria.len());
    for criterion in criteria {
        let name = match criterion.question.filter(|_| several_questions) {
            Some(question) => format!("Question {}: {}", Num(question), criterion.criteria),
            None => criterion.criteria.clone(),
        };
        // Two criteria of one name would share a heading and a weight.
        let mut unique = name.clone();
        let mut copy = 2;
        while categories.contains(&unique) {
            unique = format!("{name} ({copy})");
            copy += 1;
        }
        categories.push(unique);
    }

    let points: Vec<f64> = criteria.iter().map(|c| c.points).collect();
    let total: f64 = points.iter().sum();
    let weights = (points.iter().all(|points| *points > 0.0) && criteria.len() > 1)
        .then(|| proportional_shares(&points, total));

    let mut lines = Vec::with_capacity(criteria.len() * 2);
    for (index, (criterion, category)) in criteria.iter().zip(&categories).enumerate() {
        lines.push(match &weights {
            Some(weights) => format!("## {category} [{}%]", Num(weights[index])),
            None => format!("## {category}"),
        });
        lines.push(if criterion.description.is_empty() {
            criterion.criteria.clone()
        } else {
            criterion.description.clone()
        });
    }
    lines.join("\n")
}

/// Rubric text with its requirements replaced by `requirements` and its
/// exemplar answer, if it has one, kept.
pub fn with_requirements(text: &str, requirements: &str) -> String {
    match text.find(MODEL_RESPONSE_MARKER) {
        Some(marker) => format!("{requirements}\n\n{}", &text[marker..]),
        None => requirements.to_owned(),
    }
}
