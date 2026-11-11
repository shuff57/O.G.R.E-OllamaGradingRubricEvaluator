use std::fmt;
use std::time::Duration;

use serde_json::Value;

const REDACTED: &str = "[REDACTED]";

/// Which wire protocol a provider speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderKind {
    /// An Ollama daemon, usually on this machine. Cloud models pulled into a
    /// local daemon (`name:cloud`) go through here too.
    Ollama,
    /// Ollama's API on a remote host such as `https://ollama.com`. Same
    /// protocol as [`ProviderKind::Ollama`], shorter timeout.
    OllamaCloud,
    /// OpenAI, or any server that speaks its chat completions API.
    OpenAi,
    Anthropic,
    Gemini,
}

impl ProviderKind {
    /// The name used in error messages.
    pub const fn id(self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
            Self::OllamaCloud => "ollama-cloud",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "google-gemini",
        }
    }

    /// Maps a provider id from the JavaScript grading server.
    ///
    /// Returns `None` for the providers this crate does not speak. That
    /// includes `ollama-cloud`: in the grading server that id meant a RunPod
    /// endpoint, not Ollama's API. Its Ollama-protocol cloud id was `ogre-cloud`.
    pub fn from_js_id(id: &str) -> Option<Self> {
        match id.to_ascii_lowercase().as_str() {
            "ollama" | "ollama-local" => Some(Self::Ollama),
            "ogre-cloud" => Some(Self::OllamaCloud),
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            "google-gemini" => Some(Self::Gemini),
            _ => None,
        }
    }

    pub const fn default_base_url(self) -> &'static str {
        match self {
            Self::Ollama => "http://localhost:11434",
            Self::OllamaCloud => "https://ollama.com",
            Self::OpenAi => "https://api.openai.com",
            Self::Anthropic => "https://api.anthropic.com",
            Self::Gemini => "https://generativelanguage.googleapis.com",
        }
    }

    /// How long one attempt may take. A local model grading a large batch can
    /// run for minutes; hosted Ollama models that think need nearly as long.
    pub const fn default_timeout(self) -> Duration {
        match self {
            Self::Ollama => Duration::from_secs(600),
            Self::OllamaCloud => Duration::from_secs(480),
            Self::OpenAi | Self::Anthropic | Self::Gemini => Duration::from_secs(30),
        }
    }

    pub(crate) const fn speaks_ollama(self) -> bool {
        matches!(self, Self::Ollama | Self::OllamaCloud)
    }
}

impl fmt::Display for ProviderKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.id())
    }
}

/// Generation settings. `None` means the provider's default from the grading server.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProviderOptions {
    /// Defaults to 0.2, except on Anthropic where it is left out unless set:
    /// current Claude models reject the parameter.
    pub temperature: Option<f64>,
    /// Upper bound on the reply. Defaults to 16000 on OpenAI and Anthropic and
    /// to the server's own limit on Ollama (`num_predict`) and Gemini
    /// (`maxOutputTokens`).
    pub max_tokens: Option<u32>,
    /// Ollama context window. Defaults to 8192.
    pub num_ctx: Option<u32>,
    /// How long Ollama keeps the model loaded after the call. Defaults to `60m`.
    pub keep_alive: Option<String>,
}

#[derive(Clone, PartialEq)]
pub struct ProviderConfig {
    pub kind: ProviderKind,
    /// Scheme and host, with or without a trailing slash. For OpenAI-compatible
    /// servers a trailing `/v1` is accepted as well.
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub options: ProviderOptions,
}

impl ProviderConfig {
    /// A config pointing at the provider's usual address, with no key.
    pub fn new(kind: ProviderKind, model: impl Into<String>) -> Self {
        Self {
            kind,
            base_url: kind.default_base_url().to_owned(),
            api_key: None,
            model: model.into(),
            options: ProviderOptions::default(),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn with_options(mut self, options: ProviderOptions) -> Self {
        self.options = options;
        self
    }

    /// The key, treating an empty one as absent.
    pub(crate) fn key(&self) -> Option<&str> {
        self.api_key.as_deref().filter(|key| !key.is_empty())
    }
}

impl fmt::Debug for ProviderConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProviderConfig")
            .field("kind", &self.kind)
            .field("base_url", &self.base_url)
            .field("api_key", &self.api_key.as_ref().map(|_| REDACTED))
            .field("model", &self.model)
            .field("options", &self.options)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Role {
    System,
    User,
    Assistant,
}

impl Role {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

/// An image attached to a message.
#[derive(Clone, PartialEq, Eq)]
pub struct Image {
    /// Such as `image/png`.
    pub media_type: String,
    /// Base64, without a `data:` prefix.
    pub data: String,
}

impl Image {
    pub fn new(media_type: impl Into<String>, data: impl Into<String>) -> Self {
        Self {
            media_type: media_type.into(),
            data: data.into(),
        }
    }

    /// Parses `data:<media type>;base64,<data>`.
    pub fn from_data_url(url: &str) -> Option<Self> {
        let (media_type, data) = url.strip_prefix("data:")?.split_once(";base64,")?;
        (!media_type.is_empty() && !data.is_empty()).then(|| Self::new(media_type, data))
    }

    pub fn to_data_url(&self) -> String {
        format!("data:{};base64,{}", self.media_type, self.data)
    }
}

// A page scan is megabytes of base64; keep it out of logs.
impl fmt::Debug for Image {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Image")
            .field("media_type", &self.media_type)
            .field("data", &format_args!("<{} base64 chars>", self.data.len()))
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub role: Role,
    pub text: String,
    pub images: Vec<Image>,
}

impl Message {
    pub fn new(role: Role, text: impl Into<String>) -> Self {
        Self {
            role,
            text: text.into(),
            images: Vec::new(),
        }
    }

    pub fn system(text: impl Into<String>) -> Self {
        Self::new(Role::System, text)
    }

    pub fn user(text: impl Into<String>) -> Self {
        Self::new(Role::User, text)
    }

    pub fn assistant(text: impl Into<String>) -> Self {
        Self::new(Role::Assistant, text)
    }

    pub fn with_image(mut self, image: Image) -> Self {
        self.images.push(image);
        self
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChatRequest {
    pub messages: Vec<Message>,
    /// Ask the provider to answer with a JSON document. Has no effect on
    /// Anthropic, which has no schema-free JSON mode; ask for JSON in the prompt.
    pub json: bool,
}

impl ChatRequest {
    pub fn new(messages: impl Into<Vec<Message>>) -> Self {
        Self {
            messages: messages.into(),
            json: false,
        }
    }

    pub fn with_json(mut self, json: bool) -> Self {
        self.json = json;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}

/// A request ready to be sent by whatever HTTP client the caller has.
#[derive(Clone, PartialEq)]
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<(String, String)>,
    /// The JSON body, or `Value::Null` for a request without one.
    pub body: Value,
}

impl HttpRequest {
    /// Looks a header up by name, ignoring case.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

impl fmt::Debug for HttpRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let headers: Vec<(&str, &str)> = self
            .headers
            .iter()
            .map(|(name, value)| {
                let secret = ["authorization", "x-api-key", "x-goog-api-key"]
                    .iter()
                    .any(|candidate| name.eq_ignore_ascii_case(candidate));
                (name.as_str(), if secret { REDACTED } else { value })
            })
            .collect();
        f.debug_struct("HttpRequest")
            .field("method", &self.method)
            .field("url", &self.url)
            .field("headers", &headers)
            .field("body", &self.body)
            .finish()
    }
}
