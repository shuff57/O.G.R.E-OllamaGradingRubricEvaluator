//! Running the generic page scripts and decoding what they return.

use ogre_core::FeedbackKind;
use serde::Deserialize;
use serde_json::Value;

use super::profile::PageMap;
use crate::driver::eval_as;
use crate::{PageDriver, Result};

const PAGE_SCRIPT: &str = include_str!("page.js");

/// Builds the expression that calls `script` with the page helpers for `map`
/// and one more argument.
pub(super) fn call(script: &str, map: &PageMap, args: &Value) -> Result<String> {
    let map = serde_json::to_string(map)?;
    Ok(format!("({script})(({PAGE_SCRIPT})({map}), {args})"))
}

/// Looks up everything `map` points at, for every student shown.
pub(super) async fn inspect(page: &dyn PageDriver, map: &PageMap) -> Result<Inspection> {
    let mut found: Inspection =
        eval_as(page, &call("(page) => page.inspect()", map, &Value::Null)?).await?;
    read_frames(page, map, &mut found).await;
    Ok(found)
}

/// Reads the answers and questions that are shown in a frame from another
/// site. A script in the page cannot look into such a frame; the browser
/// can. Where it cannot either, the content stays marked as out of reach.
async fn read_frames(page: &dyn PageDriver, map: &PageMap, found: &mut Inspection) {
    let Ok(map) = serde_json::to_string(map) else {
        return;
    };
    for student in &mut found.students {
        let index = student.index;
        let parts = [
            ("response", Some(&mut student.response)),
            ("prompt", student.prompt.as_mut()),
        ];
        for (what, content) in parts {
            let Some(content) = content.filter(|content| content.blocked) else {
                continue;
            };
            let frame = format!("(({PAGE_SCRIPT})({map})).contentFrame({index}, \"{what}\")");
            // Inside the frame its document is the page, so the same
            // helper turns what it shows into the HTML that is kept.
            let read = format!("(({PAGE_SCRIPT})({{}})).htmlOf(document.body)");
            if let Ok(Value::String(html)) = page.eval_in_frame(&frame, &read).await {
                content.html = Some(html);
                content.blocked = false;
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct Inspection {
    pub url: String,
    pub title: String,
    pub sections: Sections,
    pub students: Vec<Student>,
    pub save: Option<Save>,
    /// The buttons to the next and the previous student, where mapped.
    #[serde(default)]
    pub next: Option<StepButton>,
    #[serde(default)]
    pub previous: Option<StepButton>,
}

/// What a rule for a button to another student found on the page.
#[derive(Debug, Clone, Copy, Deserialize)]
pub(super) struct StepButton {
    pub count: usize,
    pub invalid: bool,
    /// True if there is exactly one and it can be pressed.
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct Sections {
    pub invalid: bool,
    /// Elements the section selector matches, shown or not.
    pub matched: usize,
    pub hidden: usize,
    /// Shown sections that contain another shown section.
    pub nested: usize,
}

#[derive(Debug, Deserialize)]
pub(super) struct Student {
    pub index: usize,
    pub student_id: Option<String>,
    pub name: Name,
    pub score: Score,
    pub max: Option<Max>,
    pub feedback: Option<Feedback>,
    pub response: Content,
    pub prompt: Option<Content>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Name {
    pub count: usize,
    pub invalid: bool,
    pub text: String,
}

/// The fields after `invalid` are present when exactly one element matched.
#[derive(Debug, Deserialize)]
pub(super) struct Score {
    pub count: usize,
    pub invalid: bool,
    pub control: Option<String>,
    #[serde(default)]
    pub is_input: bool,
    #[serde(default)]
    pub writable: bool,
    #[serde(default)]
    pub shown: bool,
    pub field: Option<String>,
    pub label: Option<String>,
    pub raw: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Max {
    pub value: Option<f64>,
    /// Elements a selector rule matched; absent for the other rules.
    pub count: Option<usize>,
    #[serde(default)]
    pub invalid: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct Feedback {
    pub count: usize,
    pub invalid: bool,
    pub field: Option<String>,
    /// What the box turned out to be; `None` if it cannot be typed into.
    pub kind: Option<FeedbackKind>,
    /// The name of an editor that owns the box and that OGRE cannot drive.
    pub foreign: Option<String>,
    #[serde(default)]
    pub writable: bool,
    pub text: Option<String>,
    pub hidden: Option<Match>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Match {
    pub count: usize,
    pub invalid: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct Content {
    pub count: usize,
    pub invalid: bool,
    pub html: Option<String>,
    pub text: Option<String>,
    /// The element is a frame from another site, which cannot be read.
    #[serde(default)]
    pub blocked: bool,
}

impl Content {
    /// The content as markdown; empty when nothing was read.
    pub fn markdown(&self) -> String {
        match (&self.text, &self.html) {
            (Some(text), _) => text.trim().to_owned(),
            (None, Some(html)) => to_markdown(html),
            (None, None) => String::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct Save {
    /// Visible buttons the rule matches.
    pub count: usize,
    pub invalid: bool,
    pub success_invalid: bool,
    pub pattern_invalid: bool,
}

/// Converts page HTML to markdown, falling back to the raw HTML if it cannot be parsed.
pub(super) fn to_markdown(html: &str) -> String {
    htmd::convert(html)
        .map(|md| md.trim().to_owned())
        .unwrap_or_else(|_| html.trim().to_owned())
}

#[cfg(test)]
pub(super) mod testing {
    use serde_json::{Value, json};

    use super::Inspection;

    /// One student as the page script reports a fully mapped, healthy section.
    pub fn student(index: usize, name: &str) -> Value {
        json!({
            "index": index,
            "student_id": format!("s{index}"),
            "name": { "count": 1, "invalid": false, "text": name },
            "score": {
                "count": 1, "invalid": false, "control": "input type=\"number\"",
                "is_input": true, "writable": true, "shown": true,
                "field": format!("name:score_{index}"), "label": "Score", "raw": "",
            },
            "max": { "value": 10.0 },
            "feedback": {
                "count": 1, "invalid": false, "field": format!("name:fb_{index}"),
                "kind": "textarea", "foreign": null, "writable": true, "text": "",
            },
            "response": { "count": 1, "invalid": false, "html": "<p>An answer.</p>", "blocked": false },
            "prompt": null,
        })
    }

    pub fn inspection(students: Vec<Value>) -> Value {
        json!({
            "url": "https://lms.example.edu/grade",
            "title": "Grading",
            "sections": { "invalid": false, "matched": students.len(), "hidden": 0, "nested": 0 },
            "students": students,
            "save": null,
        })
    }

    pub fn decode(value: Value) -> Inspection {
        serde_json::from_value(value).expect("fixture matches the script's shape")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_prefers_plain_text_and_converts_html() {
        let from = |value: Value| serde_json::from_value::<Content>(value).unwrap();
        let html = from(serde_json::json!({
            "count": 1, "invalid": false, "html": "<p>Uses the <em>power</em> rule.</p>"
        }));
        assert_eq!(html.markdown(), "Uses the *power* rule.");
        let text = from(serde_json::json!({ "count": 1, "invalid": false, "text": " x^2 <b> " }));
        assert_eq!(text.markdown(), "x^2 <b>");
        let none = from(serde_json::json!({ "count": 0, "invalid": false }));
        assert_eq!(none.markdown(), "");
        assert!(!none.blocked);
    }

    #[test]
    fn a_call_passes_the_map_and_arguments_as_json() {
        let map: PageMap = serde_json::from_value(serde_json::json!({
            "student_section": null, "student_name": "h2", "score_input": "input[name=\"s\"]",
            "max_score": null, "feedback": null, "response": "#work", "prompt": null, "save": null
        }))
        .unwrap();
        let expression = call("(page, n) => n", &map, &serde_json::json!(7)).unwrap();
        assert!(expression.starts_with("((page, n) => n)(("), "{expression}");
        assert!(
            expression.ends_with(r##""score_input":"input[name=\"s\"]","max_score":null,"feedback":null,"response":"#work","prompt":null,"save":null}), 7)"##),
            "{expression}"
        );
    }
}
