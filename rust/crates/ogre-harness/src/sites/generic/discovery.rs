//! Asking an AI where things are on a grading page, and checking its answer.
//!
//! The prompts and the tolerant reading of replies are ported from the
//! desktop app's `discover.ts`, where they were tuned against real models.
//! What is new is that an answer is tried on the live page and the model is
//! told exactly which selectors failed before it is asked again.

use std::collections::BTreeMap;

use ogre_core::FeedbackKind;
use ogre_llm::{ChatProvider, ChatRequest, LlmError, Message};
use serde_json::Value;

use super::heuristics::{self, Mode};
use super::profile::{
    ButtonRule, FeedbackBox, MaxScoreRule, PageMap, SaveRule, Saving, SiteProfile,
};
use super::snapshot::{Snapshot, SnapshotOptions, capture_snapshot};
use super::validate::{Element, ValidatedProfile, ValidationReport, validate_profile};
use crate::PageDriver;

/// The instructions given to the AI. Verbatim from `discover.ts`.
pub const DISCOVERY_SYSTEM_PROMPT: &str = include_str!("discovery_system_prompt.txt");

/// How many answers the AI gets before discovery gives up.
pub const DISCOVERY_MAX_ATTEMPTS: usize = 3;

/// Heuristics are trusted without asking an AI only above this confidence.
const HEURISTIC_CONFIDENCE: f64 = 0.7;

/// How much of a rejected answer is shown back to the AI.
const REPLY_ECHO_CHARS: usize = 4000;

/// What the teacher already knows about the page, passed on to the AI.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DiscoveryHints {
    /// Text added to the request as it stands.
    pub prompt_addendum: Option<String>,
    pub page_description: Option<String>,
    pub estimated_student_count: Option<usize>,
    pub navigation_mode: Option<Mode>,
    /// Selectors the teacher believes are right, by the AI's names for them
    /// (`studentSection`, `scoreInput`, ...).
    pub known_selectors: BTreeMap<String, String>,
    pub extra_context: Option<String>,
}

impl DiscoveryHints {
    /// The hints as the block of text appended to the request, or `None` if
    /// there is nothing to say.
    fn as_prompt(&self) -> Option<String> {
        let mut parts = Vec::new();
        if let Some(text) = present(&self.prompt_addendum) {
            parts.push(text.to_owned());
        }
        if let Some(text) = present(&self.page_description) {
            parts.push(format!("Page description: {text}"));
        }
        if let Some(count) = self.estimated_student_count {
            parts.push(format!("Estimated student count: {count}"));
        }
        if let Some(mode) = self.navigation_mode {
            parts.push(format!("Expected navigation mode: {}", mode_name(mode)));
        }
        if !self.known_selectors.is_empty() {
            let json = serde_json::to_string(&self.known_selectors).unwrap_or_default();
            parts.push(format!("Known selectors: {json}"));
        }
        if let Some(text) = present(&self.extra_context) {
            parts.push(format!("Additional context: {text}"));
        }
        (!parts.is_empty()).then(|| format!("User hints:\n{}", parts.join("\n")))
    }
}

fn present(text: &Option<String>) -> Option<&str> {
    text.as_deref().filter(|t| !t.is_empty())
}

fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::Batch => "batch",
        Mode::Sequential => "sequential",
    }
}

/// The page's address without its query and fragment, which can carry
/// student ids and session tokens. A local file is named without its folder.
fn public_url(url: &str) -> String {
    let url = url.split(['?', '#']).next().unwrap_or(url);
    match url.strip_prefix("file://") {
        Some(path) => format!("file:///{}", path.rsplit('/').next().unwrap_or(path)),
        None => url.to_owned(),
    }
}

/// The request that asks an AI to map the page in `snapshot`.
///
/// Its user message is the one from `discover.ts`, with one paragraph added:
/// OGRE sends no screenshot, and the outline marks runs of alike rows.
pub fn discovery_request(snapshot: &Snapshot, hints: &DiscoveryHints) -> ChatRequest {
    let outline = snapshot.outline();
    let truncation = if outline.nodes < outline.total {
        format!(
            " (truncated from {} to {} nodes to fit context limits)",
            outline.total, outline.nodes
        )
    } else {
        String::new()
    };
    let mut prompt = format!(
        "Analyze this grading page and identify its structure.\n\
         \n\
         Page URL: {url}\n\
         \n\
         DOM SNAPSHOT (simplified tree, {count} nodes{truncation}):\n\
         {json}\n\
         \n\
         Look at the screenshot to understand the visual layout, and use the DOM snapshot to find precise CSS selectors. The goal is to find selectors that will let the tool automatically extract student names and responses, fill in scores and feedback, and click save.\n\
         \n\
         No screenshot is attached for this page: work from the DOM snapshot alone. Where an element has \"repeats\": N, it is the first of N alike siblings on the page and only the first few are listed.\n\
         \n\
         **Important:** Respond with ONLY valid JSON. No markdown, no code blocks, no explanations.",
        url = public_url(&snapshot.url),
        count = outline.nodes,
        json = outline.json,
    );
    if let Some(hints) = hints.as_prompt() {
        prompt.push_str("\n\n");
        prompt.push_str(&hints);
    }
    ChatRequest::new([
        Message::system(DISCOVERY_SYSTEM_PROMPT),
        Message::user(prompt),
    ])
    .with_json(true)
}

/// Why an AI's reply could not be turned into a draft.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DiscoveryParseError {
    #[error("Could not parse AI discovery response as JSON")]
    NotJson,
    #[error(
        "AI response parsed but missing required fields (studentName, scoreInput, navigation.mode, feedback, or save)"
    )]
    MissingFields,
    /// The reply is well formed but leaves out something a profile needs.
    #[error("{0}")]
    Incomplete(String),
}

/// An AI's answer as a page map that has not been tried on the page yet.
#[derive(Debug, Clone, PartialEq)]
pub struct DiscoveryDraft {
    pub mode: Mode,
    pub page: PageMap,
    /// A second label to look for if no button carries the first.
    pub fallback_save_text: Option<String>,
    /// The AI's own "high", "medium" or "low".
    pub confidence: Option<String>,
    pub notes: Option<String>,
}

/// Reads an AI's reply into a draft. Tolerates what models wrap JSON in:
/// thinking blocks, code fences, prose before and after, trailing commas,
/// HTML-escaped quotes, and a reply cut off before its closing braces.
pub fn parse_discovery_response(reply: &str) -> Result<DiscoveryDraft, DiscoveryParseError> {
    let answer = extract_discovery_json(reply)?;
    if !is_valid_discovery_result(&answer) {
        return Err(DiscoveryParseError::MissingFields);
    }
    draft_from(&answer)
}

/// Finds the JSON object in an AI's reply. The object is not checked for
/// the fields discovery needs; see [`is_valid_discovery_result`].
pub fn extract_discovery_json(reply: &str) -> Result<Value, DiscoveryParseError> {
    let text = strip_thinking(reply.trim());
    let text = text
        .trim()
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let text = drop_trailing_commas(&text);
    let text = fenced(&text).unwrap_or(&text);

    // Several objects: the last one that has selectors is the corrected one.
    if let Some(object) = last_object_with_selectors(text)
        && let Ok(value) = serde_json::from_str(object)
    {
        return Ok(value);
    }
    if let Ok(value) = serde_json::from_str(text) {
        return Ok(value);
    }
    let first = text.find('{').ok_or(DiscoveryParseError::NotJson)?;
    let last = text.rfind('}').filter(|&last| last > first);
    let braced = match last {
        Some(last) => &text[first..=last],
        None => &text[first..],
    };
    if last.is_some()
        && let Ok(value) = serde_json::from_str(braced)
    {
        return Ok(value);
    }
    // A reply cut off at the end: supply up to three closing braces.
    let open = braced.matches('{').count();
    let closed = braced.matches('}').count();
    if (1..=3).contains(&open.saturating_sub(closed)) {
        let repaired = format!("{braced}{}", "}".repeat(open - closed));
        if let Ok(value) = serde_json::from_str(&repaired) {
            return Ok(value);
        }
    }
    Err(DiscoveryParseError::NotJson)
}

/// Removes every `<think>...</think>` block.
fn strip_thinking(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        // ASCII lower-casing keeps every byte offset where it was.
        let lower = rest.to_ascii_lowercase();
        let Some(start) = lower.find("<think>") else {
            break;
        };
        let Some(length) = lower[start..].find("</think>") else {
            break;
        };
        out.push_str(&rest[..start]);
        rest = &rest[start + length + "</think>".len()..];
    }
    out.push_str(rest);
    out
}

/// Removes commas that are followed only by white space and a closing bracket.
fn drop_trailing_commas(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for (at, c) in text.char_indices() {
        let closes = || text[at + 1..].trim_start().starts_with(['}', ']']);
        if c != ',' || !closes() {
            out.push(c);
        }
    }
    out
}

/// The contents of a markdown code fence, if the text has one. A fence
/// inside a fence, which some models produce, is unwrapped twice.
fn fenced(text: &str) -> Option<&str> {
    double_fenced(text)
        .or_else(|| single_fenced(text, "```json"))
        .or_else(|| single_fenced(text, FENCE))
}

const FENCE: &str = "```";

fn single_fenced<'a>(text: &'a str, open: &str) -> Option<&'a str> {
    let start = text.find(open)? + open.len();
    let length = text[start..].find(FENCE)?;
    Some(text[start..start + length].trim())
}

/// ```` ```json ```json { ... } ``` ``` ````, the outer label being optional.
fn double_fenced(text: &str) -> Option<&str> {
    for (outer, _) in text.match_indices(FENCE) {
        let rest = &text[outer + FENCE.len()..];
        let rest = rest.strip_prefix("json").unwrap_or(rest);
        let Some(body) = rest.trim_start().strip_prefix("```json") else {
            continue;
        };
        let closing = body
            .match_indices(FENCE)
            .find(|(at, _)| body[at + FENCE.len()..].trim_start().starts_with(FENCE));
        if let Some((end, _)) = closing {
            return Some(body[..end].trim());
        }
    }
    None
}

/// The innermost object around the last `"selectors"` key.
fn last_object_with_selectors(text: &str) -> Option<&str> {
    let key = text.rfind("\"selectors\"")?;
    let bytes = text.as_bytes();
    let mut depth = 0usize;
    let mut start = None;
    for at in (0..=key).rev() {
        match bytes[at] {
            b'}' => depth += 1,
            b'{' if depth == 0 => {
                start = Some(at);
                break;
            }
            b'{' => depth -= 1,
            _ => {}
        }
    }
    let start = start?;
    let mut depth = 0usize;
    for (at, byte) in bytes.iter().enumerate().skip(start) {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&text[start..=at]);
                }
            }
            _ => {}
        }
    }
    None
}

const FEEDBACK_TYPES: [&str; 5] = [
    "textarea",
    "tinymce-inline",
    "tinymce-iframe",
    "contenteditable",
    "unknown",
];

/// Whether an AI's answer has the fields discovery cannot do without.
pub fn is_valid_discovery_result(answer: &Value) -> bool {
    let text = |part: &str, field: &str| answer[part][field].as_str().filter(|s| !s.is_empty());
    ["navigation", "selectors", "feedback", "save"]
        .iter()
        .all(|part| answer[part].is_object())
        && matches!(text("navigation", "mode"), Some("batch" | "sequential"))
        && text("selectors", "studentName").is_some()
        && text("selectors", "scoreInput").is_some()
        && text("feedback", "type").is_some_and(|kind| FEEDBACK_TYPES.contains(&kind))
        && answer["feedback"]["requiresHiddenSync"].is_boolean()
        && answer["feedback"]["htmlWrap"].is_boolean()
        && text("save", "buttonText").is_some()
}

/// Turns a valid answer into a page map.
fn draft_from(answer: &Value) -> Result<DiscoveryDraft, DiscoveryParseError> {
    let text = |part: &str, field: &str| {
        answer[part][field]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    let incomplete = |what: &str| DiscoveryParseError::Incomplete(what.to_owned());

    let mode = match text("navigation", "mode").as_deref() {
        Some("sequential") => Mode::Sequential,
        _ => Mode::Batch,
    };
    let student_section = match mode {
        Mode::Sequential => None,
        Mode::Batch => Some(text("selectors", "studentSection").ok_or_else(|| {
            incomplete(
                "navigation.mode is \"batch\" but selectors.studentSection is missing: give the selector that matches every student's container",
            )
        })?),
    };
    let response = text("selectors", "questionRegion").ok_or_else(|| {
        incomplete(
            "selectors.questionRegion is missing: give the selector for the element that holds the student's response",
        )
    })?;

    // A box of unknown type is taken for plain text until the page shows otherwise.
    let kind = match text("feedback", "type").as_deref() {
        Some("tinymce-inline" | "tinymce-iframe" | "contenteditable") => FeedbackKind::RichText,
        _ => FeedbackKind::Textarea,
    };
    let feedback = text("selectors", "feedbackBox").map(|selector| FeedbackBox {
        selector,
        kind,
        hidden_field: text("selectors", "feedbackHidden")
            .filter(|_| kind == FeedbackKind::RichText),
    });

    let step = |field: &str| {
        text("navigation", field)
            .filter(|_| mode == Mode::Sequential)
            .map(|selector| ButtonRule::Selector { selector })
    };

    Ok(DiscoveryDraft {
        mode,
        page: PageMap {
            student_section,
            student_name: text("selectors", "studentName")
                .ok_or(DiscoveryParseError::MissingFields)?,
            score_input: text("selectors", "scoreInput")
                .ok_or(DiscoveryParseError::MissingFields)?,
            // The AI is not asked for this; the usual "/ 10" is tried on the page.
            max_score: Some(MaxScoreRule::usual()),
            feedback,
            response,
            prompt: None,
            save: text("save", "buttonText").map(|text| SaveRule {
                button: ButtonRule::Text { text },
                success: None,
            }),
            // Only a page that shows one student has a next one to go to.
            frame: None,
            next_student: step("nextButton"),
            previous_student: step("prevButton"),
            // "Save and next" on a page that shows one student: the label
            // is all there is to go by.
            saving: text("save", "buttonText")
                .filter(|_| mode == Mode::Sequential)
                .map(|label| Saving::of_button_labelled(&label))
                .unwrap_or_default(),
        },
        fallback_save_text: text("save", "fallbackText"),
        confidence: answer["confidence"].as_str().map(str::to_owned),
        notes: answer["notes"].as_str().map(str::to_owned),
    })
}

/// How [`discover`] goes about it.
#[derive(Debug, Clone, PartialEq)]
pub struct DiscoverOptions {
    pub snapshot: SnapshotOptions,
    pub hints: DiscoveryHints,
    /// Answers the AI gets before giving up.
    pub max_attempts: usize,
    /// Go straight to the AI. For when the structure-based mapping passed
    /// validation but the teacher can see that it is wrong.
    pub skip_heuristics: bool,
}

impl Default for DiscoverOptions {
    fn default() -> Self {
        Self {
            snapshot: SnapshotOptions::default(),
            hints: DiscoveryHints::default(),
            max_attempts: DISCOVERY_MAX_ATTEMPTS,
            skip_heuristics: false,
        }
    }
}

/// Where a discovered profile came from.
#[derive(Debug, Clone, PartialEq)]
pub enum DiscoverySource {
    /// The page's structure was enough; no AI was asked.
    Heuristics { pattern: String, confidence: f64 },
    /// The AI's answer number `attempts` passed validation.
    Ai {
        attempts: usize,
        confidence: Option<String>,
    },
}

/// A profile that was found for a page and passed validation on it.
#[derive(Debug, Clone)]
pub struct Discovery {
    pub profile: ValidatedProfile,
    /// The passing report: what was read, and the limits the teacher should know.
    pub report: ValidationReport,
    pub source: DiscoverySource,
    /// What was changed in the draft to make it fit, and the AI's own remarks.
    pub notes: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error(transparent)]
    Page(#[from] crate::Error),
    /// The AI provider refused in a way that trying again will not fix.
    #[error(transparent)]
    Ai(LlmError),
    #[error("Discovery failed after {} attempts:\n{}", .attempts.len(), .attempts.join("\n"))]
    Failed {
        /// What was wrong with each answer.
        attempts: Vec<String>,
    },
}

/// Works out a profile for the page and proves it on the page.
///
/// The page's structure is tried first. If that is not conclusive the AI is
/// asked; each answer is validated against the live page, and a failed one
/// goes back to the AI with the list of what did not match.
///
/// Reads the page, changes nothing on it.
pub async fn discover(
    page: &dyn PageDriver,
    provider: &dyn ChatProvider,
    options: &DiscoverOptions,
) -> Result<Discovery, DiscoveryError> {
    let snapshot = capture_snapshot(page, &options.snapshot).await?;

    if !options.skip_heuristics
        && let Some(found) = heuristics::detect(&snapshot)
        && found.confidence > HEURISTIC_CONFIDENCE
        && let Some(map) = found.page_map()
    {
        let draft = SiteProfile::for_page(&snapshot.url, map);
        let (report, notes) = settle(page, draft, None).await?;
        let all_students = found.students_seen.is_none_or(|n| n == report.students);
        if all_students && let Ok(profile) = report.clone().into_validated() {
            return Ok(Discovery {
                profile,
                report,
                source: DiscoverySource::Heuristics {
                    pattern: found.pattern_name,
                    confidence: found.confidence,
                },
                notes,
            });
        }
    }

    let first = discovery_request(&snapshot, &options.hints);
    let mut request = first.clone();
    let mut failures = Vec::new();
    for attempt in 1..=options.max_attempts {
        let reply = match provider.chat(&request).await {
            Ok(reply) => reply,
            Err(error) if !error.is_retryable() => return Err(DiscoveryError::Ai(error)),
            Err(error) => {
                failures.push(format!("Attempt {attempt}: {error}"));
                request = first.clone();
                continue;
            }
        };
        let problem = match parse_discovery_response(&reply) {
            Err(error) => format!("Your answer could not be used: {error}."),
            Ok(draft) => {
                let profile = SiteProfile::for_page(&snapshot.url, draft.page);
                let (report, mut notes) = settle(page, profile, draft.fallback_save_text).await?;
                match report.clone().into_validated() {
                    Ok(profile) => {
                        notes.extend(draft.notes.map(|text| format!("The AI noted: {text}")));
                        return Ok(Discovery {
                            profile,
                            report,
                            source: DiscoverySource::Ai {
                                attempts: attempt,
                                confidence: draft.confidence,
                            },
                            notes,
                        });
                    }
                    Err(report) => validation_feedback(&report),
                }
            }
        };
        failures.push(format!("Attempt {attempt}: {problem}"));
        request = follow_up(&first, &reply, &problem);
    }
    Err(DiscoveryError::Failed { attempts: failures })
}

/// Adjusts the parts of a draft that the page itself can settle, and
/// returns the report for the draft as adjusted with a note on each change.
///
/// Only guesses are touched: what kind of box the feedback box is, where the
/// maximum is written, and which button saves. A selector for a student, a
/// name, a score box or a response is never changed here.
async fn settle(
    page: &dyn PageDriver,
    mut profile: SiteProfile,
    mut fallback_save_text: Option<String>,
) -> crate::Result<(ValidationReport, Vec<String>)> {
    let mut notes = Vec::new();
    loop {
        let report = validate_profile(page, &profile).await?;
        let mut changed = false;

        if let (Some(seen), Some(feedback)) =
            (report.feedback_kind_seen, &mut profile.page.feedback)
            && feedback.kind != seen
        {
            feedback.kind = seen;
            if seen == FeedbackKind::Textarea {
                feedback.hidden_field = None;
            }
            notes.push(
                "The feedback box is not the kind the draft said; the page's own was used."
                    .to_owned(),
            );
            changed = true;
        }
        if report.has_error(Element::MaxScore) {
            let usual = MaxScoreRule::usual();
            profile.page.max_score = match profile.page.max_score.take() {
                Some(rule) if rule != usual => Some(usual),
                _ => {
                    notes.push(
                        "No maximum score could be read from the page, so none is mapped."
                            .to_owned(),
                    );
                    None
                }
            };
            changed = true;
        }
        if report.has_error(Element::SaveButton) || report.has_error(Element::SaveConfirmation) {
            profile.page.save = match (profile.page.save.take(), fallback_save_text.take()) {
                (Some(mut rule), Some(text)) => {
                    if profile.page.saving == Saving::ButtonMovesOn {
                        profile.page.saving = Saving::of_button_labelled(&text);
                    }
                    rule.button = ButtonRule::Text { text };
                    Some(rule)
                }
                _ => {
                    notes.push(
                        "The page's save button could not be identified, so none is mapped."
                            .to_owned(),
                    );
                    None
                }
            };
            changed = true;
        }

        if !changed {
            return Ok((report, notes));
        }
    }
}

/// The AI's name for each part of the page, where it has one.
fn ai_name(element: Element) -> Option<&'static str> {
    match element {
        Element::StudentSection => Some("selectors.studentSection"),
        Element::StudentName => Some("selectors.studentName"),
        Element::ScoreInput => Some("selectors.scoreInput"),
        Element::Feedback => Some("selectors.feedbackBox"),
        Element::FeedbackHiddenField => Some("selectors.feedbackHidden"),
        Element::Response => Some("selectors.questionRegion"),
        Element::NextStudent => Some("navigation.nextButton"),
        Element::PreviousStudent => Some("navigation.prevButton"),
        Element::MaxScore | Element::Prompt | Element::SaveButton | Element::SaveConfirmation => {
            None
        }
    }
}

/// What to tell the AI about an answer that did not fit the page. Holds
/// selectors and counts, never anything read from the page.
fn validation_feedback(report: &ValidationReport) -> String {
    let mut lines = vec![
        "The selectors in your answer were tried on the live page and did not all work:".to_owned(),
    ];
    lines.extend(
        report
            .errors()
            .filter_map(|p| Some(format!("- {}: {}", ai_name(p.element)?, p.message))),
    );
    if report.students > 0 && report.profile().page.student_section.is_some() {
        lines.push(format!(
            "selectors.studentSection matched {} student sections. The other selectors are looked up inside each of them with section.querySelectorAll(selector).",
            report.students
        ));
    }
    lines.push("Selectors that are not listed worked.".to_owned());
    lines.join("\n")
}

/// The first request again, followed by the rejected answer and why.
fn follow_up(first: &ChatRequest, reply: &str, problem: &str) -> ChatRequest {
    let echoed: String = reply.chars().take(REPLY_ECHO_CHARS).collect();
    let mut request = first.clone();
    request.messages.push(Message::assistant(echoed));
    request.messages.push(Message::user(format!(
        "{problem}\n\nCorrect it and answer again with the complete JSON object only."
    )));
    request
}

#[cfg(test)]
mod tests {
    use ogre_llm::Role;
    use serde_json::json;

    use super::super::inspect::testing::{decode, inspection, student};
    use super::super::profile::UrlRule;
    use super::super::snapshot::testing::{node, snapshot};
    use super::super::validate::report;
    use super::*;

    const BATCH: &str = r#"{
      "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
      "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": "td.answer", "fullCreditLink": null },
      "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
      "save": { "buttonText": "Save" },
      "confidence": "high"
    }"#;

    fn selectors(reply: &str) -> Value {
        extract_discovery_json(reply).expect("JSON found")["selectors"].clone()
    }

    // ---- Ported from discover.test.ts: parseDiscoveryResponse ------------

    #[test]
    fn a_save_button_that_names_the_next_student_is_mapped_as_one_that_moves_on() {
        let reply = |mode: &str, button: &str| {
            json!({
                "navigation": { "mode": mode, "nextButton": "#next", "prevButton": "#prev", "studentIndicator": "h2", "submitButton": null, "waitForSelector": null },
                "selectors": { "studentSection": if mode == "batch" { json!(".row") } else { Value::Null }, "studentName": "h2", "scoreInput": "#score", "feedbackBox": null, "feedbackHidden": null, "questionRegion": ".work", "fullCreditLink": null },
                "feedback": { "type": "unknown", "requiresHiddenSync": false, "htmlWrap": false },
                "save": { "buttonText": button },
                "confidence": "high"
            })
            .to_string()
        };
        let saving = |mode: &str, button: &str| {
            parse_discovery_response(&reply(mode, button))
                .unwrap()
                .page
                .saving
        };
        assert_eq!(saving("sequential", "Save & Next"), Saving::ButtonMovesOn);
        assert_eq!(saving("sequential", "Save"), Saving::Button);
        // A page that lists its students has no next one to move on to.
        assert_eq!(saving("batch", "Save & Next"), Saving::Button);
    }

    #[test]
    fn parses_a_plain_json_answer() {
        let reply = json!({
            "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
            "selectors": { "studentSection": ".student-row", "studentName": ".name", "scoreInput": "input[name='score']", "feedbackBox": "textarea.feedback", "feedbackHidden": null, "questionRegion": ".work", "fullCreditLink": null },
            "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
            "save": { "buttonText": "Save", "fallbackText": "Submit" },
            "confidence": "high",
            "notes": "Standard batch grading page"
        })
        .to_string();
        let draft = parse_discovery_response(&reply).unwrap();
        assert_eq!(draft.mode, Mode::Batch);
        assert_eq!(draft.page.student_section.as_deref(), Some(".student-row"));
        assert_eq!(draft.page.student_name, ".name");
        assert_eq!(draft.page.score_input, "input[name='score']");
        assert_eq!(draft.page.response, ".work");
        assert_eq!(
            draft.page.feedback,
            Some(FeedbackBox {
                selector: "textarea.feedback".into(),
                kind: FeedbackKind::Textarea,
                hidden_field: None
            })
        );
        assert_eq!(
            draft.page.save,
            Some(SaveRule {
                button: ButtonRule::Text {
                    text: "Save".into()
                },
                success: None
            })
        );
        assert_eq!(draft.fallback_save_text.as_deref(), Some("Submit"));
        assert_eq!(draft.page.max_score, Some(MaxScoreRule::usual()));
        assert_eq!(draft.confidence.as_deref(), Some("high"));
        assert_eq!(draft.notes.as_deref(), Some("Standard batch grading page"));
    }

    #[test]
    fn parses_json_in_a_markdown_code_fence() {
        let reply = "```json\n{\n  \"navigation\": { \"mode\": \"sequential\", \"nextButton\": \"button.next\" },\n  \"selectors\": { \"studentName\": \".student-name\", \"scoreInput\": \"input#score\", \"feedbackBox\": null, \"questionRegion\": \"#work\" },\n  \"feedback\": { \"type\": \"unknown\", \"requiresHiddenSync\": false, \"htmlWrap\": false },\n  \"save\": { \"buttonText\": \"Submit\" },\n  \"confidence\": \"medium\"\n}\n```";
        let draft = parse_discovery_response(reply).unwrap();
        assert_eq!(draft.mode, Mode::Sequential);
        assert_eq!(draft.page.student_section, None);
        assert_eq!(draft.page.student_name, ".student-name");
        // The way to the next student is kept, so that every student is read.
        assert_eq!(
            draft.page.next_student,
            Some(ButtonRule::Selector {
                selector: "button.next".into()
            })
        );
        assert_eq!(draft.page.previous_student, None);
        assert_eq!(draft.page.feedback, None);

        let bare = format!("Here you go:\n```\n{BATCH}\n```\nDone.");
        assert_eq!(selectors(&bare)["studentSection"], "tr.student");
    }

    #[test]
    fn parses_json_after_thinking_blocks() {
        let reply = format!(
            "<think>\nLet me analyze this page structure...\nIt has {{ braces }} in it.\n</think>\n\n<THINK>more</THINK>{BATCH}"
        );
        let draft = parse_discovery_response(&reply).unwrap();
        assert_eq!(draft.mode, Mode::Batch);
        assert_eq!(draft.page.student_section.as_deref(), Some("tr.student"));
    }

    #[test]
    fn text_that_is_not_json_is_an_error() {
        let err = parse_discovery_response("This is not JSON at all").unwrap_err();
        assert_eq!(err, DiscoveryParseError::NotJson);
        assert_eq!(
            err.to_string(),
            "Could not parse AI discovery response as JSON"
        );
        assert_eq!(
            extract_discovery_json(""),
            Err(DiscoveryParseError::NotJson)
        );
        assert_eq!(
            extract_discovery_json("{ \"selectors\": "),
            Err(DiscoveryParseError::NotJson)
        );
    }

    #[test]
    fn json_without_selectors_is_read_but_is_not_a_valid_answer() {
        let reply = json!({
            "navigation": { "mode": "batch" },
            "feedback": { "type": "textarea" },
            "save": { "buttonText": "Save" }
        })
        .to_string();
        let answer = extract_discovery_json(&reply).unwrap();
        assert_eq!(answer["navigation"]["mode"], "batch");
        assert!(!is_valid_discovery_result(&answer));
        assert_eq!(
            parse_discovery_response(&reply),
            Err(DiscoveryParseError::MissingFields)
        );
    }

    #[test]
    fn trailing_commas_are_cleaned_up() {
        let reply = r#"{
          "navigation": { "mode": "batch", "nextButton": null, },
          "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "questionRegion": "td.a", "fullCreditLink": null, },
          "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false, },
          "save": { "buttonText": "Save", },
          "confidence": "high",
        }"#;
        let draft = parse_discovery_response(reply).unwrap();
        assert_eq!(draft.page.student_section.as_deref(), Some("tr.student"));
        assert_eq!(draft.confidence.as_deref(), Some("high"));
        assert_eq!(drop_trailing_commas("[1, 2, ]"), "[1, 2 ]");
        assert_eq!(drop_trailing_commas("a, b"), "a, b");
    }

    #[test]
    fn a_fence_inside_a_fence_is_unwrapped() {
        let reply = format!("```json\n```json\n{BATCH}\n```\n```");
        assert_eq!(selectors(&reply)["studentSection"], "tr.student");
        let unlabelled = format!("```\n```json\n{BATCH}\n```\n```");
        assert_eq!(selectors(&unlabelled)["scoreInput"], "input.score");
    }

    #[test]
    fn html_escaped_quotes_are_unescaped() {
        let reply = BATCH.replace('"', "&quot;");
        let draft = parse_discovery_response(&reply).unwrap();
        assert_eq!(draft.mode, Mode::Batch);
        assert_eq!(
            draft.page.save.map(|s| s.button),
            Some(ButtonRule::Text {
                text: "Save".into()
            })
        );
    }

    #[test]
    fn prose_before_and_after_the_json_is_ignored() {
        let reply = format!(
            "Based on my analysis of the page, here is the structured result:\n\n{BATCH}\n\nI hope this analysis helps with your grading automation setup!"
        );
        let draft = parse_discovery_response(&reply).unwrap();
        assert_eq!(draft.mode, Mode::Batch);
        assert_eq!(draft.confidence.as_deref(), Some("high"));

        // Without a "selectors" key the outermost braces are used.
        let other = extract_discovery_json("Sure: {\"a\": {\"b\": 1}} there.").unwrap();
        assert_eq!(other["a"]["b"], 1);
    }

    #[test]
    fn of_several_objects_the_last_with_selectors_wins() {
        let reply = format!(
            "{{\n  \"navigation\": {{ \"mode\": \"sequential\" }},\n  \"selectors\": {{ \"studentSection\": \".wrong-first\" }}\n}}\n\nAfter re-examining, here is the corrected result:\n\n{}",
            BATCH.replace("tr.student", "tr.correct")
        );
        let draft = parse_discovery_response(&reply).unwrap();
        assert_eq!(draft.page.student_section.as_deref(), Some("tr.correct"));
        assert_eq!(draft.mode, Mode::Batch);
    }

    #[test]
    fn an_answer_cut_off_before_its_closing_braces_is_recovered() {
        let whole = BATCH.trim_end();
        let cut = whole
            .strip_suffix('}')
            .and_then(|rest| rest.trim_end().strip_suffix("\"confidence\": \"high\""))
            .map(|rest| rest.trim_end().trim_end_matches(','))
            .expect("fixture ends as expected");
        assert!(serde_json::from_str::<Value>(cut).is_err());
        let draft = parse_discovery_response(cut).unwrap();
        assert_eq!(draft.page.student_section.as_deref(), Some("tr.student"));
        assert_eq!(draft.confidence, None);

        // Four missing braces is past repair.
        assert_eq!(
            extract_discovery_json("{\"a\": {\"b\": {\"c\": {\"d\": 1"),
            Err(DiscoveryParseError::NotJson)
        );
    }

    // ---- Ported from discover.test.ts: isValidDiscoveryResult ------------

    fn valid() -> Value {
        json!({
            "navigation": { "mode": "batch", "nextButton": null },
            "selectors": { "studentSection": ".student-row", "studentName": ".name", "scoreInput": "input[name='score']", "feedbackBox": "textarea.feedback" },
            "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
            "save": { "buttonText": "Save", "fallbackText": "Submit" },
            "confidence": "high",
            "notes": "Valid batch result"
        })
    }

    #[test]
    fn complete_batch_and_sequential_answers_are_valid() {
        assert!(is_valid_discovery_result(&valid()));
        let sequential = json!({
            "navigation": { "mode": "sequential", "nextButton": "button.next", "prevButton": "button.prev", "studentIndicator": ".student-counter", "submitButton": "button.submit", "waitForSelector": ".student-name" },
            "selectors": { "studentName": ".student-name", "scoreInput": "input#score", "feedbackBox": null, "feedbackHidden": null, "questionRegion": "iframe.preview", "fullCreditLink": null },
            "feedback": { "type": "unknown", "requiresHiddenSync": false, "htmlWrap": false },
            "save": { "buttonText": "Submit" },
            "confidence": "medium"
        });
        assert!(is_valid_discovery_result(&sequential));
    }

    #[test]
    fn answers_that_are_not_objects_are_invalid() {
        for other in [json!(null), json!("not an object"), json!(123), json!([])] {
            assert!(!is_valid_discovery_result(&other), "{other}");
        }
    }

    #[test]
    fn answers_missing_a_required_part_are_invalid() {
        type Change = fn(&mut Value);
        let broken = |change: Change| {
            let mut answer = valid();
            change(&mut answer);
            answer
        };
        let cases: [(&str, Change); 9] = [
            ("no navigation", |a| a["navigation"] = Value::Null),
            ("bad mode", |a| a["navigation"]["mode"] = json!("invalid")),
            ("empty name", |a| a["selectors"]["studentName"] = json!("")),
            ("empty score", |a| a["selectors"]["scoreInput"] = json!("")),
            ("bad feedback type", |a| {
                a["feedback"]["type"] = json!("invalid")
            }),
            ("sync not a boolean", |a| {
                a["feedback"]["requiresHiddenSync"] = json!("yes")
            }),
            ("wrap missing", |a| a["feedback"]["htmlWrap"] = Value::Null),
            ("empty button text", |a| a["save"]["buttonText"] = json!("")),
            ("selectors a string", |a| a["selectors"] = json!("td.name")),
        ];
        for (what, change) in cases {
            assert!(!is_valid_discovery_result(&broken(change)), "{what}");
        }
    }

    // ---- Beyond the TypeScript suite: what a profile needs ---------------

    #[test]
    fn a_batch_answer_without_a_student_section_or_a_response_is_incomplete() {
        let mut answer = valid();
        answer["selectors"]["questionRegion"] = json!(".work");
        answer["selectors"]["studentSection"] = Value::Null;
        let err = parse_discovery_response(&answer.to_string()).unwrap_err();
        assert!(
            matches!(&err, DiscoveryParseError::Incomplete(m) if m.contains("selectors.studentSection")),
            "{err}"
        );

        let err = parse_discovery_response(&valid().to_string()).unwrap_err();
        assert!(
            matches!(&err, DiscoveryParseError::Incomplete(m) if m.contains("selectors.questionRegion")),
            "{err}"
        );
    }

    #[test]
    fn rich_text_answers_keep_their_hidden_field_and_plain_ones_drop_it() {
        let mut answer = valid();
        answer["selectors"]["questionRegion"] = json!(".work");
        answer["selectors"]["feedbackBox"] = json!("div.fbbox");
        answer["selectors"]["feedbackHidden"] = json!("input[name^='fb-']");
        answer["feedback"]["type"] = json!("tinymce-inline");
        let draft = parse_discovery_response(&answer.to_string()).unwrap();
        assert_eq!(
            draft.page.feedback,
            Some(FeedbackBox {
                selector: "div.fbbox".into(),
                kind: FeedbackKind::RichText,
                hidden_field: Some("input[name^='fb-']".into())
            })
        );

        answer["feedback"]["type"] = json!("textarea");
        let draft = parse_discovery_response(&answer.to_string()).unwrap();
        assert_eq!(draft.page.feedback.and_then(|f| f.hidden_field), None);
    }

    // ---- Ported from discover.test.ts: the prompts ------------------------

    #[test]
    fn the_system_prompt_is_the_tuned_one() {
        let prompt = DISCOVERY_SYSTEM_PROMPT;
        for part in [
            "web page structure analyzer",
            "BATCH",
            "SEQUENTIAL",
            "studentSection",
            "studentName",
            "scoreInput",
            "feedbackBox",
            "Repeating student rows",
            "Multiple score inputs",
            "page-wide",
            "Next/Previous student buttons",
            "student name dropdown",
            "X of N",
            "valid CSS",
            "attribute selectors",
            "data-testid",
            "relative selectors",
            "textarea",
            "tinymce",
            "contenteditable",
            "rich text editor",
            "\"navigation\"",
            "\"selectors\"",
            "\"feedback\"",
            "\"save\"",
            "\"confidence\"",
            "FORBIDDEN",
            "tr[id^='graderow']",
        ] {
            assert!(prompt.contains(part), "{part}");
        }
        assert!(prompt.starts_with("You are a JSON-only responder."));
        assert!(prompt.ends_with("Remember: respond with ONLY the JSON object. No other text."));
        assert!(!prompt.contains("think step by step"));
        assert_eq!(prompt.chars().count(), 14331);
        assert_eq!(DISCOVERY_MAX_ATTEMPTS, 3);
    }

    fn small_page() -> Snapshot {
        snapshot(
            node("body").child(
                node("div").class("container").child(
                    node("table")
                        .id("grades")
                        .child(node("td").saying("Carol Davis")),
                ),
            ),
        )
    }

    #[test]
    fn the_request_carries_the_page_outline_and_asks_for_json() {
        let request = discovery_request(&small_page(), &DiscoveryHints::default());
        assert!(request.json);
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.messages[0].role, Role::System);
        assert_eq!(request.messages[0].text, DISCOVERY_SYSTEM_PROMPT);
        assert_eq!(request.messages[1].role, Role::User);
        assert!(request.messages.iter().all(|m| m.images.is_empty()));

        let prompt = &request.messages[1].text;
        assert!(
            prompt
                .starts_with("Analyze this grading page and identify its structure.\n\nPage URL: ")
        );
        assert!(prompt.contains(
            "DOM SNAPSHOT (simplified tree, 4 nodes):\n[{\"depth\":0,\"tag\":\"body\"},"
        ));
        assert!(prompt.contains("{\"depth\":2,\"tag\":\"table\",\"attrs\":{\"id\":\"grades\"}}"));
        for part in [
            "screenshot",
            "DOM snapshot",
            "CSS selectors",
            "student names",
            "responses",
            "scores",
            "feedback",
            "No screenshot is attached",
        ] {
            assert!(prompt.contains(part), "{part}");
        }
        assert!(prompt.ends_with(
            "**Important:** Respond with ONLY valid JSON. No markdown, no code blocks, no explanations."
        ));
    }

    #[test]
    fn the_request_names_the_page_without_its_query() {
        let request = discovery_request(&small_page(), &DiscoveryHints::default());
        let prompt = &request.messages[1].text;
        assert!(prompt.contains("Page URL: https://lms.example.edu/course/7/grade\n"));
        assert!(!prompt.contains("student=12"));

        assert_eq!(
            public_url("file:///home/teacher/fixtures/unknown-lms.html#x"),
            "file:///unknown-lms.html"
        );
        assert_eq!(
            public_url("https://x.example/a/b?token=secret#frag"),
            "https://x.example/a/b"
        );
    }

    #[test]
    fn a_large_page_is_cut_to_the_budget_and_the_request_says_so() {
        let rows = (0..400).map(|i| {
            node("div")
                .id(&format!("elem-{i}"))
                .saying(&format!("Element {i}"))
        });
        let mut page = snapshot(node("body").children(rows));
        page.options.char_budget = 12000;
        let request = discovery_request(&page, &DiscoveryHints::default());
        let prompt = &request.messages[1].text;

        let outline = prompt
            .split_once("to fit context limits)):\n")
            .and_then(|(_, rest)| rest.split_once("\n\nLook at"))
            .map(|(outline, _)| outline)
            .expect("truncation note and outline are present");
        assert!(outline.len() <= 12000, "{}", outline.len());
        let listed: Value = serde_json::from_str(outline).expect("whole elements only");
        let kept = listed.as_array().map_or(0, Vec::len);
        assert!(kept > 100 && kept < 401, "{kept}");
        assert!(prompt.contains(&format!("{kept} nodes (truncated from 401 to {kept} nodes")));
    }

    #[test]
    fn hints_are_appended_in_the_order_the_app_used() {
        let hints = DiscoveryHints {
            prompt_addendum: Some("Rows are table rows.".into()),
            page_description: Some("Essay grading".into()),
            estimated_student_count: Some(28),
            navigation_mode: Some(Mode::Batch),
            known_selectors: BTreeMap::from([("scoreInput".to_owned(), "input.pts".to_owned())]),
            extra_context: Some("Moodle".into()),
        };
        let request = discovery_request(&small_page(), &hints);
        assert!(request.messages[1].text.ends_with(
            "No markdown, no code blocks, no explanations.\n\nUser hints:\nRows are table rows.\nPage description: Essay grading\nEstimated student count: 28\nExpected navigation mode: batch\nKnown selectors: {\"scoreInput\":\"input.pts\"}\nAdditional context: Moodle"
        ));

        let empty = DiscoveryHints {
            page_description: Some(String::new()),
            ..DiscoveryHints::default()
        };
        assert!(
            !discovery_request(&small_page(), &empty).messages[1]
                .text
                .contains("User hints")
        );
    }

    // ---- The retry conversation -------------------------------------------

    #[test]
    fn validation_feedback_names_the_ai_s_fields_and_quotes_no_page_text() {
        let draft = parse_discovery_response(BATCH).unwrap();
        let profile = SiteProfile::new("x", "X", UrlRule::new("x.example", "/"), draft.page);
        let mut students = vec![student(0, "Alice Johnson"), student(1, "Bob Smith")];
        for s in &mut students {
            s["name"] = json!({ "count": 0, "invalid": false, "text": "" });
            s["score"]["count"] = json!(2);
        }
        let failed = report(&profile, &decode(inspection(students)));
        let feedback = validation_feedback(&failed);
        assert_eq!(
            feedback,
            "The selectors in your answer were tried on the live page and did not all work:\n\
             - selectors.studentName: `td.name` matches nothing inside any student section\n\
             - selectors.scoreInput: `input.score` matches several elements for every student; it has to match exactly one\n\
             selectors.studentSection matched 2 student sections. The other selectors are looked up inside each of them with section.querySelectorAll(selector).\n\
             Selectors that are not listed worked."
        );
        assert!(!feedback.contains("Alice") && !feedback.contains("An answer"));
    }

    #[test]
    fn a_follow_up_repeats_the_request_then_the_answer_and_what_was_wrong() {
        let first = discovery_request(&small_page(), &DiscoveryHints::default());
        let long_reply = "x".repeat(REPLY_ECHO_CHARS + 500);
        let next = follow_up(
            &first,
            &long_reply,
            "Your answer could not be used: no JSON.",
        );
        assert!(next.json);
        assert_eq!(next.messages.len(), 4);
        assert_eq!(next.messages[..2], first.messages[..]);
        assert_eq!(next.messages[2].role, Role::Assistant);
        assert_eq!(next.messages[2].text.len(), REPLY_ECHO_CHARS);
        assert_eq!(next.messages[3].role, Role::User);
        assert_eq!(
            next.messages[3].text,
            "Your answer could not be used: no JSON.\n\nCorrect it and answer again with the complete JSON object only."
        );
    }
}
