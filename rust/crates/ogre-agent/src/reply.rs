//! Turns the AI's raw text into one action or a plain message.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value};

/// What the AI answered.
#[derive(Debug, Clone, PartialEq)]
pub enum AgentReply {
    /// `{"action": ..., "params": {...}, "reasoning": ...}`. The action name
    /// and parameters are as the AI wrote them, not yet checked.
    Action {
        name: String,
        params: Map<String, Value>,
        reasoning: String,
    },
    /// `{"text": ...}`, or anything that could not be read as an action.
    Text(String),
}

static THINK: LazyLock<Regex> = LazyLock::new(|| regex(r"(?is)<think>.*?</think>"));
static COMMENT: LazyLock<Regex> = LazyLock::new(|| regex(r"(?s)<!--.*?-->"));
static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| regex(r",(\s*[}\]])"));
static FENCE: LazyLock<Regex> = LazyLock::new(|| regex(r"(?s)```(?:json)?\s*(.*?)\s*```"));

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("pattern is a valid constant")
}

/// Reads a model's reply. Tolerates thinking blocks, HTML comments, HTML
/// entities, trailing commas, code fences and prose around the JSON. A reply
/// with no usable JSON object comes back whole as [`AgentReply::Text`].
pub fn parse_agent_reply(raw: &str) -> AgentReply {
    let text = raw.trim();
    let text = THINK.replace_all(text, "");
    let text = COMMENT.replace_all(&text, "");
    let text = text
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let text = TRAILING_COMMA.replace_all(&text, "$1");
    let text = match FENCE.captures(&text) {
        Some(fenced) => fenced[1].trim().to_owned(),
        None => text.into_owned(),
    };
    let text = text.trim_matches('`');

    candidates(text)
        .find_map(interpret)
        .unwrap_or_else(|| AgentReply::Text(raw.to_owned()))
}

/// JSON values that might be the reply: everything from the first `{` to the
/// last `}`, then each object found reading left to right. The second pass
/// finds the action when the model wrote braces in the prose around it, or
/// answered with more than one object. It never looks inside an object that
/// parsed, so an action quoted within another value is not mistaken for the
/// reply.
fn candidates(text: &str) -> impl Iterator<Item = Value> {
    let outer = text
        .find('{')
        .zip(text.rfind('}'))
        .filter(|(first, last)| last > first)
        .and_then(|(first, last)| serde_json::from_str(&text[first..=last]).ok());

    let mut scanned = Vec::new();
    let mut from = 0;
    while let Some(offset) = text[from..].find('{') {
        let start = from + offset;
        let mut stream = serde_json::Deserializer::from_str(&text[start..]).into_iter::<Value>();
        match stream.next() {
            Some(Ok(value)) => {
                from = start + stream.byte_offset();
                scanned.push(value);
            }
            _ => from = start + 1,
        }
    }
    outer.into_iter().chain(scanned)
}

fn interpret(value: Value) -> Option<AgentReply> {
    let Value::Object(mut object) = value else {
        return None;
    };
    if let Some(Value::String(name)) = object.remove("action").filter(is_filled_text) {
        let reasoning = match object.remove("reasoning") {
            Some(Value::String(reasoning)) => reasoning,
            _ => String::new(),
        };
        // The prompt asks for nested `params`; some models put them beside
        // the action name instead.
        let params = match object.remove("params") {
            Some(Value::Object(nested)) => nested,
            _ => object,
        };
        return Some(AgentReply::Action {
            name,
            params,
            reasoning,
        });
    }
    match object.remove("text").filter(is_filled_text) {
        Some(Value::String(text)) => Some(AgentReply::Text(text)),
        _ => None,
    }
}

fn is_filled_text(value: &Value) -> bool {
    value.as_str().is_some_and(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn action(name: &str, params: Value, reasoning: &str) -> AgentReply {
        AgentReply::Action {
            name: name.to_owned(),
            params: params.as_object().cloned().expect("an object"),
            reasoning: reasoning.to_owned(),
        }
    }

    fn text(content: &str) -> AgentReply {
        AgentReply::Text(content.to_owned())
    }

    // The cases of agent-api.test.ts.

    #[test]
    fn parses_a_direct_action_with_nested_params() {
        assert_eq!(
            parse_agent_reply(
                r##"{"action":"click","params":{"selector":"#submit"},"reasoning":"open form"}"##
            ),
            action("click", json!({ "selector": "#submit" }), "open form")
        );
    }

    #[test]
    fn parses_json_inside_markdown_fences() {
        assert_eq!(
            parse_agent_reply("```json\n{\"text\":\"fenced response\"}\n```"),
            text("fenced response")
        );
    }

    #[test]
    fn strips_think_blocks_before_parsing() {
        assert_eq!(
            parse_agent_reply(r#"<think>plan first</think>{"text":"visible response"}"#),
            text("visible response")
        );
    }

    #[test]
    fn strips_html_comment_blocks_before_parsing() {
        assert_eq!(
            parse_agent_reply(r#"<!-- hidden reasoning -->{"text":"comment cleaned"}"#),
            text("comment cleaned")
        );
    }

    #[test]
    fn removes_trailing_commas_before_parsing() {
        assert_eq!(
            parse_agent_reply(
                r##"{"action":"click","params":{"selector":"#save",},"reasoning":"done",}"##
            ),
            action("click", json!({ "selector": "#save" }), "done")
        );
    }

    #[test]
    fn unescapes_html_entities_before_parsing() {
        assert_eq!(
            parse_agent_reply(r#"{"text":"Fish &amp; Chips &lt;3 &gt; 2"}"#),
            text("Fish & Chips <3 > 2")
        );
    }

    #[test]
    fn unwraps_json_from_surrounding_prose() {
        assert_eq!(
            parse_agent_reply(r#"assistant output: {"text":"wrapped response"} thanks"#),
            text("wrapped response")
        );
    }

    #[test]
    fn parses_json_wrapped_in_inline_backticks() {
        assert_eq!(
            parse_agent_reply(r#"`{"text":"inline code response"}`"#),
            text("inline code response")
        );
    }

    #[test]
    fn treats_call_syntax_and_plain_prose_as_text() {
        assert_eq!(parse_agent_reply("click(#foo)"), text("click(#foo)"));
        assert_eq!(
            parse_agent_reply("not json, not an action, just text"),
            text("not json, not an action, just text")
        );
    }

    // Beyond the desktop app's cases.

    #[test]
    fn takes_flat_parameters_when_there_is_no_params_object() {
        assert_eq!(
            parse_agent_reply(r##"{"action":"type","selector":"#q","text":"hi","reasoning":"r"}"##),
            action("type", json!({ "selector": "#q", "text": "hi" }), "r")
        );
    }

    #[test]
    fn finds_the_action_when_the_prose_has_braces_of_its_own() {
        let reply = "I will use {selector} syntax.\n\
                     {\"action\":\"click\",\"params\":{\"selector\":\"e4\"},\"reasoning\":\"go\"}\n\
                     Then I will check {the result}.";
        assert_eq!(
            parse_agent_reply(reply),
            action("click", json!({ "selector": "e4" }), "go")
        );
    }

    #[test]
    fn takes_the_first_of_several_actions() {
        let reply = "{\"action\":\"click\",\"params\":{\"selector\":\"e1\"}}\n\
                     {\"action\":\"done\",\"params\":{\"success\":true,\"message\":\"x\"}}";
        assert_eq!(
            parse_agent_reply(reply),
            action("click", json!({ "selector": "e1" }), "")
        );
    }

    #[test]
    fn a_thinking_block_cannot_smuggle_in_an_action() {
        let reply = "<think>{\"action\":\"runJS\",\"params\":{\"code\":\"x\"}}</think>\
                     {\"action\":\"done\",\"params\":{\"success\":true,\"message\":\"ok\"}}";
        assert_eq!(
            parse_agent_reply(reply),
            action("done", json!({ "success": true, "message": "ok" }), "")
        );
    }

    #[test]
    fn json_that_is_neither_an_action_nor_text_comes_back_whole() {
        assert_eq!(
            parse_agent_reply(r#"{"answer": 4}"#),
            text(r#"{"answer": 4}"#)
        );
        assert_eq!(parse_agent_reply(""), text(""));
        assert_eq!(parse_agent_reply("{"), text("{"));
    }
}
