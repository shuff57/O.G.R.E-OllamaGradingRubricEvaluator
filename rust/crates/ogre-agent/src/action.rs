//! The actions the AI can ask for, and what running one reports back.

use std::fmt;

use serde::Serialize;
use serde_json::{Map, Value};

/// JavaScript the `runJS` action refuses to run. A coarse filter kept from the
/// desktop app; the real safeguard is that `runJS` always needs approval.
pub const DANGEROUS_JS_PATTERNS: [&str; 10] = [
    "eval(",
    "Function(",
    "__proto__",
    "import(",
    "fetch(",
    "__lookupGetter__",
    "__lookupSetter__",
    "constructor.constructor",
    "document.write",
    "document.writeln",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// One step the AI asked for, with its parameters checked.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Click {
        selector: String,
    },
    TripleClick {
        selector: String,
    },
    Type {
        selector: String,
        text: String,
        clear: bool,
    },
    Scroll {
        direction: ScrollDirection,
        amount: f64,
    },
    ScrollIntoView {
        text: String,
    },
    ReadText {
        selector: Option<String>,
    },
    Screenshot,
    WaitFor {
        selector: String,
        timeout_ms: Option<u64>,
    },
    Navigate {
        url: String,
    },
    RunJs {
        code: String,
    },
    Sleep {
        ms: u64,
    },
    PressKey {
        key: String,
    },
    WriteCodeMirror {
        selector: String,
        value: String,
    },
    Done {
        success: bool,
        message: String,
    },
}

/// Why a reply from the AI could not be turned into an [`Action`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionError {
    Unknown(String),
    MissingParam {
        action: &'static str,
        param: &'static str,
    },
    InvalidParam {
        action: &'static str,
        param: &'static str,
        reason: String,
    },
}

impl fmt::Display for ActionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unknown(name) => write!(f, "Unknown action: {name}"),
            Self::MissingParam { action, param } => {
                write!(f, "Action {action} needs the \"{param}\" parameter")
            }
            Self::InvalidParam {
                action,
                param,
                reason,
            } => write!(f, "Action {action} has an invalid \"{param}\": {reason}"),
        }
    }
}

impl std::error::Error for ActionError {}

impl Action {
    /// The name the AI uses for this action.
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Click { .. } => "click",
            Self::TripleClick { .. } => "triple_click",
            Self::Type { .. } => "type",
            Self::Scroll { .. } => "scroll",
            Self::ScrollIntoView { .. } => "scrollIntoView",
            Self::ReadText { .. } => "readText",
            Self::Screenshot => "screenshot",
            Self::WaitFor { .. } => "waitFor",
            Self::Navigate { .. } => "navigate",
            Self::RunJs { .. } => "runJS",
            Self::Sleep { .. } => "sleep",
            Self::PressKey { .. } => "pressKey",
            Self::WriteCodeMirror { .. } => "writeCodeMirror",
            Self::Done { .. } => "done",
        }
    }

    /// Whether the action only looks at the page or waits.
    pub const fn is_read_only(&self) -> bool {
        matches!(
            self,
            Self::Scroll { .. }
                | Self::ScrollIntoView { .. }
                | Self::ReadText { .. }
                | Self::Screenshot
                | Self::WaitFor { .. }
                | Self::Sleep { .. }
                | Self::Done { .. }
        )
    }

    /// The element the action names, as the AI wrote it.
    pub fn selector(&self) -> Option<&str> {
        match self {
            Self::Click { selector }
            | Self::TripleClick { selector }
            | Self::Type { selector, .. }
            | Self::WaitFor { selector, .. }
            | Self::WriteCodeMirror { selector, .. } => Some(selector),
            Self::ReadText { selector } => selector.as_deref(),
            _ => None,
        }
    }

    /// Builds an action from the name and parameters in the AI's reply. Models
    /// send booleans and numbers as strings often enough that both are taken.
    pub fn from_reply(name: &str, params: &Map<String, Value>) -> Result<Self, ActionError> {
        let action = match name {
            "click" => Self::Click {
                selector: required_text("click", params, "selector")?,
            },
            "triple_click" => Self::TripleClick {
                selector: required_text("triple_click", params, "selector")?,
            },
            "type" => Self::Type {
                selector: required_text("type", params, "selector")?,
                text: text_param(params, "text").ok_or(ActionError::MissingParam {
                    action: "type",
                    param: "text",
                })?,
                clear: flag(params, "clear"),
            },
            "scroll" => {
                let direction = required_text("scroll", params, "direction")?;
                let direction = match direction.to_ascii_lowercase().as_str() {
                    "up" => ScrollDirection::Up,
                    "down" => ScrollDirection::Down,
                    "left" => ScrollDirection::Left,
                    "right" => ScrollDirection::Right,
                    _ => {
                        return Err(ActionError::InvalidParam {
                            action: "scroll",
                            param: "direction",
                            reason: format!("Invalid scroll direction: {direction}"),
                        });
                    }
                };
                let amount = number(params, "amount").ok_or(ActionError::MissingParam {
                    action: "scroll",
                    param: "amount",
                })?;
                Self::Scroll { direction, amount }
            }
            "scrollIntoView" => Self::ScrollIntoView {
                text: required_text("scrollIntoView", params, "text")?,
            },
            "readText" => Self::ReadText {
                selector: text_param(params, "selector").filter(|s| !s.trim().is_empty()),
            },
            "screenshot" => Self::Screenshot,
            "waitFor" => Self::WaitFor {
                selector: required_text("waitFor", params, "selector")?,
                timeout_ms: number(params, "timeoutMs").map(to_millis),
            },
            "navigate" => Self::Navigate {
                url: required_text("navigate", params, "url")?,
            },
            "runJS" => Self::RunJs {
                code: required_text("runJS", params, "code")?,
            },
            "sleep" => Self::Sleep {
                ms: number(params, "ms")
                    .map(to_millis)
                    .ok_or(ActionError::MissingParam {
                        action: "sleep",
                        param: "ms",
                    })?,
            },
            "pressKey" => Self::PressKey {
                key: required_text("pressKey", params, "key")?,
            },
            "writeCodeMirror" => Self::WriteCodeMirror {
                selector: required_text("writeCodeMirror", params, "selector")?,
                value: text_param(params, "value").ok_or(ActionError::MissingParam {
                    action: "writeCodeMirror",
                    param: "value",
                })?,
            },
            "done" => Self::Done {
                // A `done` that does not say how it went counts as a success.
                success: params.get("success").is_none_or(truthy),
                message: text_param(params, "message")
                    .filter(|m| !m.is_empty())
                    .unwrap_or_else(|| "Task completed".to_owned()),
            },
            other => return Err(ActionError::Unknown(other.to_owned())),
        };
        Ok(action)
    }
}

fn text_param(params: &Map<String, Value>, key: &str) -> Option<String> {
    match params.get(key)? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn required_text(
    action: &'static str,
    params: &Map<String, Value>,
    param: &'static str,
) -> Result<String, ActionError> {
    text_param(params, param)
        .filter(|text| !text.trim().is_empty())
        .ok_or(ActionError::MissingParam { action, param })
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Bool(flag) => *flag,
        Value::String(text) => text.trim().eq_ignore_ascii_case("true"),
        _ => false,
    }
}

fn flag(params: &Map<String, Value>, key: &str) -> bool {
    params.get(key).is_some_and(truthy)
}

fn number(params: &Map<String, Value>, key: &str) -> Option<f64> {
    let number = match params.get(key)? {
        Value::Number(number) => number.as_f64()?,
        Value::String(text) => text.trim().parse().ok()?,
        _ => return None,
    };
    number.is_finite().then_some(number)
}

fn to_millis(value: f64) -> u64 {
    // Saturating: a negative wait is no wait.
    value.max(0.0) as u64
}

/// What running an action produced. Serializes to the JSON the AI is shown.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
pub struct ActionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
    /// `data` holds text taken from the web page. The AI is told so, because
    /// a page can say anything, including things that read like instructions.
    #[serde(skip)]
    pub page_content: bool,
}

impl ActionResult {
    pub fn ok() -> Self {
        Self {
            success: true,
            ..Self::default()
        }
    }

    pub fn ok_with(data: Value) -> Self {
        Self {
            success: true,
            data: Some(data),
            ..Self::default()
        }
    }

    pub fn failed(error: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(error.into()),
            ..Self::default()
        }
    }

    pub(crate) fn with_page_content(mut self) -> Self {
        self.page_content = true;
        self
    }

    /// The JSON shown to the AI.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"success":false}"#.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn params(value: Value) -> Map<String, Value> {
        value.as_object().cloned().expect("an object")
    }

    #[test]
    fn builds_each_action_from_its_parameters() {
        let cases = [
            ("click", json!({ "selector": "#a" })),
            ("triple_click", json!({ "selector": "#a" })),
            ("type", json!({ "selector": "#a", "text": "hi" })),
            ("scroll", json!({ "direction": "down", "amount": 300 })),
            ("scrollIntoView", json!({ "text": "Brook, Kai" })),
            ("readText", json!({})),
            ("screenshot", json!({})),
            ("waitFor", json!({ "selector": "#a" })),
            ("navigate", json!({ "url": "https://example.com" })),
            ("runJS", json!({ "code": "document.title" })),
            ("sleep", json!({ "ms": 100 })),
            ("pressKey", json!({ "key": "Tab" })),
            (
                "writeCodeMirror",
                json!({ "selector": "#control", "value": "$a = 1" }),
            ),
            ("done", json!({ "success": true, "message": "ok" })),
        ];
        for (name, value) in cases {
            let action = Action::from_reply(name, &params(value)).expect(name);
            assert_eq!(action.name(), name);
        }
    }

    #[test]
    fn accepts_strings_where_models_send_them_for_booleans_and_numbers() {
        let typed = Action::from_reply(
            "type",
            &params(json!({ "selector": "#a", "text": 7, "clear": "true" })),
        );
        assert_eq!(
            typed,
            Ok(Action::Type {
                selector: "#a".into(),
                text: "7".into(),
                clear: true
            })
        );
        let scroll = Action::from_reply(
            "scroll",
            &params(json!({ "direction": "UP", "amount": "250" })),
        );
        assert_eq!(
            scroll,
            Ok(Action::Scroll {
                direction: ScrollDirection::Up,
                amount: 250.0
            })
        );
        let done = Action::from_reply("done", &params(json!({ "success": "false" })));
        assert_eq!(
            done,
            Ok(Action::Done {
                success: false,
                message: "Task completed".into()
            })
        );
    }

    #[test]
    fn typing_an_empty_string_is_allowed_but_a_missing_text_is_not() {
        let empty = Action::from_reply(
            "type",
            &params(json!({ "selector": "#a", "text": "", "clear": true })),
        );
        assert!(empty.is_ok());
        let missing = Action::from_reply("type", &params(json!({ "selector": "#a" })));
        assert_eq!(
            missing,
            Err(ActionError::MissingParam {
                action: "type",
                param: "text"
            })
        );
    }

    #[test]
    fn rejects_unknown_actions_and_bad_parameters() {
        let unknown = Action::from_reply("capturePopup", &Map::new()).unwrap_err();
        assert_eq!(unknown.to_string(), "Unknown action: capturePopup");

        let sideways = Action::from_reply(
            "scroll",
            &params(json!({ "direction": "sideways", "amount": 1 })),
        )
        .unwrap_err();
        assert!(
            sideways
                .to_string()
                .contains("Invalid scroll direction: sideways")
        );

        assert!(Action::from_reply("click", &params(json!({ "selector": "  " }))).is_err());
        assert!(Action::from_reply("click", &params(json!({ "selector": ["#a"] }))).is_err());
    }

    #[test]
    fn a_result_serializes_like_the_desktop_app_did() {
        assert_eq!(ActionResult::ok().to_json(), r#"{"success":true}"#);
        assert_eq!(
            ActionResult::failed("Element not found: #x").to_json(),
            r#"{"success":false,"error":"Element not found: #x"}"#
        );
        assert_eq!(
            ActionResult::ok_with(json!({ "sleptMs": 5 }))
                .with_page_content()
                .to_json(),
            r#"{"success":true,"data":{"sleptMs":5}}"#
        );
    }
}
