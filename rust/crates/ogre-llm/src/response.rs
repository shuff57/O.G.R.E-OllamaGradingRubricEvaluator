//! Response parsers, one per provider protocol.

use serde_json::Value;

use crate::error::{LlmError, Result};
use crate::types::ProviderKind;

/// Extracts the reply text from a provider's chat response.
pub fn parse_chat_response(kind: ProviderKind, data: &Value) -> Result<String> {
    let text = match kind {
        ProviderKind::Ollama | ProviderKind::OllamaCloud => ollama_text(data)?,
        ProviderKind::OpenAi => openai_text(data)?,
        ProviderKind::Anthropic => anthropic_text(data)?,
        ProviderKind::Gemini => gemini_text(data)?,
    };
    if text.is_empty() {
        return Err(LlmError::EmptyReply(kind));
    }
    Ok(text)
}

/// Extracts the embedding vector from a provider's embeddings response.
pub fn parse_embed_response(kind: ProviderKind, data: &Value) -> Result<Vec<f32>> {
    let embedding = match kind {
        ProviderKind::Ollama | ProviderKind::OllamaCloud => data.get("embedding"),
        ProviderKind::OpenAi => data.pointer("/data/0/embedding"),
        ProviderKind::Gemini => data.pointer("/embedding/values"),
        ProviderKind::Anthropic => {
            return Err(LlmError::Unsupported(
                "Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini)."
                    .to_owned(),
            ));
        }
    };
    embedding
        .and_then(Value::as_array)
        .and_then(|values| {
            values
                .iter()
                .map(|value| value.as_f64().map(|number| number as f32))
                .collect()
        })
        .ok_or_else(|| {
            LlmError::InvalidResponse(format!(
                "Invalid {kind} embedding response: missing embedding array"
            ))
        })
}

/// Extracts the model names from Ollama's `GET /api/tags` response.
pub fn parse_model_list(data: &Value) -> Result<Vec<String>> {
    let models = data
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("Invalid Ollama response: missing models"))?;
    Ok(models
        .iter()
        .filter_map(|model| model.get("name").and_then(Value::as_str))
        .map(str::to_owned)
        .collect())
}

fn ollama_text(data: &Value) -> Result<String> {
    let field = |name: &str| {
        data.pointer(&format!("/message/{name}"))
            .and_then(Value::as_str)
    };
    // Reasoning models (deepseek-r1, qwq) can leave `content` empty and put
    // the whole answer in `thinking`.
    let thinking = field("thinking").filter(|thinking| !thinking.is_empty());
    match (field("content"), thinking) {
        (Some(content), _) if !content.is_empty() => Ok(content.to_owned()),
        (_, Some(thinking)) => Ok(thinking.to_owned()),
        (Some(_), None) => Ok(String::new()),
        (None, None) => Err(invalid("Invalid Ollama response: missing message.content")),
    }
}

fn openai_text(data: &Value) -> Result<String> {
    data.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| invalid("Invalid OpenAI response: missing choices[0].message.content"))
}

fn anthropic_text(data: &Value) -> Result<String> {
    // Thinking blocks come before the text and long answers can span several
    // text blocks, so read every text block rather than only the first.
    let texts: Vec<&str> = data
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").is_none_or(|kind| kind == "text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect();
    if texts.is_empty() {
        return Err(missing(
            "Invalid Anthropic response: missing content[0].text",
            "stop_reason",
            data.get("stop_reason"),
        ));
    }
    Ok(texts.concat())
}

fn gemini_text(data: &Value) -> Result<String> {
    let candidate = data.pointer("/candidates/0");
    let texts: Vec<&str> = candidate
        .and_then(|candidate| candidate.pointer("/content/parts"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| part.get("thought").and_then(Value::as_bool) != Some(true))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect();
    if texts.is_empty() {
        return Err(missing(
            "Invalid Google Gemini response: missing candidates[0].content.parts[0].text",
            "finishReason",
            candidate.and_then(|candidate| candidate.get("finishReason")),
        ));
    }
    Ok(texts.concat())
}

fn invalid(message: &str) -> LlmError {
    LlmError::InvalidResponse(message.to_owned())
}

/// A missing-text error that says why the provider stopped, when it told us.
/// That is what distinguishes a refusal or a safety block from a malformed answer.
fn missing(message: &str, reason_field: &str, reason: Option<&Value>) -> LlmError {
    match reason.and_then(Value::as_str) {
        Some(reason) => LlmError::InvalidResponse(format!("{message} ({reason_field}: {reason})")),
        None => invalid(message),
    }
}
