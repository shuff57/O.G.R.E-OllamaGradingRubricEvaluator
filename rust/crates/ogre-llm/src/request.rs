//! Request builders, one per provider protocol.

use serde_json::{Map, Value, json};

use crate::error::{LlmError, Result};
use crate::types::{
    ChatRequest, HttpMethod, HttpRequest, Image, Message, ProviderConfig, ProviderKind, Role,
};

const DEFAULT_TEMPERATURE: f64 = 0.2;
const DEFAULT_MAX_TOKENS: u32 = 16_000;
const DEFAULT_NUM_CTX: u32 = 8192;
const DEFAULT_KEEP_ALIVE: &str = "60m";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Builds the chat call for `config.kind`.
pub fn build_chat_request(config: &ProviderConfig, request: &ChatRequest) -> Result<HttpRequest> {
    match config.kind {
        ProviderKind::Ollama | ProviderKind::OllamaCloud => Ok(ollama_chat(config, request)),
        ProviderKind::OpenAi => Ok(openai_chat(config, request)),
        ProviderKind::Anthropic => anthropic_chat(config, request),
        ProviderKind::Gemini => gemini_chat(config, request),
    }
}

/// Builds a request for the embedding of `text`. Anthropic has no embeddings API.
pub fn build_embed_request(config: &ProviderConfig, text: &str) -> Result<HttpRequest> {
    let base = base_url(config);
    let model = &config.model;
    match config.kind {
        ProviderKind::Ollama | ProviderKind::OllamaCloud => Ok(post(
            format!("{base}/api/embeddings"),
            bearer(config),
            json!({ "model": model, "prompt": text }),
        )),
        ProviderKind::OpenAi => Ok(post(
            format!("{}/embeddings", openai_v1(base)),
            bearer(config),
            json!({ "model": model, "input": text }),
        )),
        ProviderKind::Gemini => Ok(post(
            format!("{base}/v1beta/models/{model}:embedContent"),
            vec![gemini_key(config)?],
            json!({ "content": { "parts": [{ "text": text }] } }),
        )),
        ProviderKind::Anthropic => Err(LlmError::Unsupported(
            "Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini)."
                .to_owned(),
        )),
    }
}

/// Builds the request that lists the models an Ollama server has (`GET /api/tags`).
pub fn build_list_models_request(config: &ProviderConfig) -> Result<HttpRequest> {
    if !config.kind.speaks_ollama() {
        return Err(LlmError::Unsupported(format!(
            "Listing models is only supported for Ollama, not {}",
            config.kind
        )));
    }
    Ok(HttpRequest {
        method: HttpMethod::Get,
        url: format!("{}/api/tags", base_url(config)),
        headers: bearer(config),
        body: Value::Null,
    })
}

fn ollama_chat(config: &ProviderConfig, request: &ChatRequest) -> HttpRequest {
    let options = &config.options;
    // Ollama takes text and images side by side, not as OpenAI-style content parts.
    let messages: Vec<Value> = request
        .messages
        .iter()
        .map(|message| {
            let mut entry = json!({ "role": message.role.as_str(), "content": message.text });
            if !message.images.is_empty() {
                let images: Vec<&str> = message.images.iter().map(|i| i.data.as_str()).collect();
                entry["images"] = json!(images);
            }
            entry
        })
        .collect();

    let mut model_options = json!({
        "temperature": options.temperature.unwrap_or(DEFAULT_TEMPERATURE),
        "num_ctx": options.num_ctx.unwrap_or(DEFAULT_NUM_CTX),
    });
    if let Some(max_tokens) = options.max_tokens {
        model_options["num_predict"] = json!(max_tokens);
    }

    let mut body = json!({
        "model": config.model,
        "messages": messages,
        "stream": false,
        "think": false,
        "keep_alive": options.keep_alive.as_deref().unwrap_or(DEFAULT_KEEP_ALIVE),
        "options": model_options,
    });
    if request.json {
        body["format"] = json!("json");
    }

    post(
        format!("{}/api/chat", base_url(config)),
        bearer(config),
        body,
    )
}

fn openai_chat(config: &ProviderConfig, request: &ChatRequest) -> HttpRequest {
    let options = &config.options;
    let messages: Vec<Value> = request
        .messages
        .iter()
        .map(|message| {
            let content = if message.images.is_empty() {
                json!(message.text)
            } else {
                Value::Array(parts(message, typed_text, |image| {
                    json!({ "type": "image_url", "image_url": { "url": image.to_data_url() } })
                }))
            };
            json!({ "role": message.role.as_str(), "content": content })
        })
        .collect();

    let mut body = json!({
        "model": config.model,
        "max_tokens": options.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        "messages": messages,
        "stream": false,
        "temperature": options.temperature.unwrap_or(DEFAULT_TEMPERATURE),
    });
    if request.json {
        body["response_format"] = json!({ "type": "json_object" });
    }

    post(
        format!("{}/chat/completions", openai_v1(base_url(config))),
        bearer(config),
        body,
    )
}

fn anthropic_chat(config: &ProviderConfig, request: &ChatRequest) -> Result<HttpRequest> {
    let key = config.key().ok_or(LlmError::MissingApiKey(config.kind))?;
    let options = &config.options;

    // The system prompt is a top-level field, not a message.
    let messages: Vec<Value> = request
        .messages
        .iter()
        .filter(|message| message.role != Role::System)
        .map(|message| {
            let content = if message.images.is_empty() {
                json!(message.text)
            } else {
                Value::Array(parts(message, typed_text, |image| {
                    json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image.media_type,
                            "data": image.data,
                        },
                    })
                }))
            };
            json!({ "role": message.role.as_str(), "content": content })
        })
        .collect();

    let mut body = json!({
        "model": config.model,
        "max_tokens": options.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        "messages": messages,
    });
    // No default here: current Claude models answer 400 when a temperature is sent.
    if let Some(temperature) = options.temperature {
        body["temperature"] = json!(temperature);
    }
    if let Some(system) = system_prompt(&request.messages) {
        body["system"] = json!(system);
    }

    Ok(post(
        format!("{}/v1/messages", base_url(config)),
        vec![
            ("x-api-key".to_owned(), key.to_owned()),
            ("anthropic-version".to_owned(), ANTHROPIC_VERSION.to_owned()),
        ],
        body,
    ))
}

fn gemini_chat(config: &ProviderConfig, request: &ChatRequest) -> Result<HttpRequest> {
    let key = gemini_key(config)?;
    let options = &config.options;

    let contents: Vec<Value> = request
        .messages
        .iter()
        .filter(|message| message.role != Role::System)
        .map(|message| {
            let role = match message.role {
                Role::Assistant => "model",
                Role::User | Role::System => "user",
            };
            let parts = if message.images.is_empty() {
                vec![json!({ "text": message.text })]
            } else {
                parts(
                    message,
                    |text| json!({ "text": text }),
                    |image| json!({ "inline_data": { "mime_type": image.media_type, "data": image.data } }),
                )
            };
            json!({ "role": role, "parts": parts })
        })
        .collect();

    let mut generation = Map::new();
    generation.insert(
        "temperature".to_owned(),
        json!(options.temperature.unwrap_or(DEFAULT_TEMPERATURE)),
    );
    if let Some(max_tokens) = options.max_tokens {
        generation.insert("maxOutputTokens".to_owned(), json!(max_tokens));
    }
    if request.json {
        generation.insert("responseMimeType".to_owned(), json!("application/json"));
    }

    let mut body = json!({ "contents": contents, "generationConfig": generation });
    if let Some(system) = system_prompt(&request.messages) {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }

    Ok(post(
        format!(
            "{}/v1beta/models/{}:generateContent",
            base_url(config),
            config.model
        ),
        vec![key],
        body,
    ))
}

fn post(url: String, auth: Vec<(String, String)>, body: Value) -> HttpRequest {
    let mut headers = vec![("Content-Type".to_owned(), "application/json".to_owned())];
    headers.extend(auth);
    HttpRequest {
        method: HttpMethod::Post,
        url,
        headers,
        body,
    }
}

fn base_url(config: &ProviderConfig) -> &str {
    config.base_url.trim_end_matches('/')
}

/// The `/v1` root of an OpenAI-compatible server. Such servers are commonly
/// configured with the `/v1` already in the address, so do not add it twice.
fn openai_v1(base: &str) -> String {
    if base.ends_with("/v1") {
        base.to_owned()
    } else {
        format!("{base}/v1")
    }
}

fn bearer(config: &ProviderConfig) -> Vec<(String, String)> {
    config
        .key()
        .map(|key| ("Authorization".to_owned(), format!("Bearer {key}")))
        .into_iter()
        .collect()
}

// Sent as a header rather than the `?key=` query parameter so the key stays
// out of URLs, which end up in logs and error messages.
fn gemini_key(config: &ProviderConfig) -> Result<(String, String)> {
    config
        .key()
        .map(|key| ("x-goog-api-key".to_owned(), key.to_owned()))
        .ok_or(LlmError::MissingApiKey(config.kind))
}

/// All system messages, in order. Providers with a single system field get them joined.
fn system_prompt(messages: &[Message]) -> Option<String> {
    let parts: Vec<&str> = messages
        .iter()
        .filter(|message| message.role == Role::System && !message.text.is_empty())
        .map(|message| message.text.as_str())
        .collect();
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

/// A message's text followed by its images, as provider content parts. Empty
/// text is left out: Anthropic rejects empty text blocks.
fn parts(
    message: &Message,
    text: impl Fn(&str) -> Value,
    image: impl Fn(&Image) -> Value,
) -> Vec<Value> {
    let text = (!message.text.is_empty()).then(|| text(&message.text));
    text.into_iter()
        .chain(message.images.iter().map(image))
        .collect()
}

fn typed_text(text: &str) -> Value {
    json!({ "type": "text", "text": text })
}
