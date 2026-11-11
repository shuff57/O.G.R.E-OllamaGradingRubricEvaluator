use std::error::Error as _;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;
use tokio::time::timeout;

use crate::error::{LlmError, Result, preview};
use crate::provider::ChatProvider;
use crate::request::{build_chat_request, build_embed_request, build_list_models_request};
use crate::response::{parse_chat_response, parse_embed_response, parse_model_list};
use crate::retry::{RetryPolicy, with_retry};
use crate::types::{ChatRequest, HttpMethod, HttpRequest, ProviderConfig};

/// Listing models is a quick probe; it should not inherit a ten minute chat timeout.
const LIST_MODELS_TIMEOUT: Duration = Duration::from_secs(30);

/// A [`ChatProvider`] that calls the provider over HTTP.
#[derive(Debug, Clone)]
pub struct HttpProvider {
    config: ProviderConfig,
    client: reqwest::Client,
    timeout: Duration,
    retry: RetryPolicy,
}

impl HttpProvider {
    /// A provider with the timeout for `config.kind` and the default retry policy.
    pub fn new(config: ProviderConfig) -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|error| LlmError::Transport {
                provider: config.kind,
                message: describe(error),
            })?;
        Ok(Self::with_client(config, client))
    }

    /// Like [`HttpProvider::new`], sharing an existing client and its connection pool.
    pub fn with_client(config: ProviderConfig, client: reqwest::Client) -> Self {
        Self {
            timeout: config.kind.default_timeout(),
            retry: RetryPolicy::default(),
            config,
            client,
        }
    }

    /// Sets how long one attempt may take. The limit applies to waiting for
    /// the response and then again to reading its body.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_retry_policy(mut self, retry: RetryPolicy) -> Self {
        self.retry = retry;
        self
    }

    pub fn config(&self) -> &ProviderConfig {
        &self.config
    }

    /// The models an Ollama server has available. One attempt, no retries.
    pub async fn list_models(&self) -> Result<Vec<String>> {
        let request = build_list_models_request(&self.config)?;
        let limit = self.timeout.min(LIST_MODELS_TIMEOUT);
        parse_model_list(&self.send(&request, limit).await?)
    }

    /// The embedding of `text`, using the configured model.
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let request = build_embed_request(&self.config, text)?;
        let data = with_retry(self.retry, || self.send(&request, self.timeout), |_, _| {}).await?;
        parse_embed_response(self.config.kind, &data)
    }

    async fn send(&self, request: &HttpRequest, limit: Duration) -> Result<Value> {
        let provider = self.config.kind;
        let timed_out = || LlmError::Timeout {
            provider,
            timeout: limit,
        };
        let transport = |error: reqwest::Error| LlmError::Transport {
            provider,
            message: self.redact(describe(error)),
        };

        let mut builder = match request.method {
            HttpMethod::Get => self.client.get(&request.url),
            HttpMethod::Post => self
                .client
                .post(&request.url)
                .body(request.body.to_string()),
        };
        for (name, value) in &request.headers {
            builder = builder.header(name, value);
        }

        let response = timeout(limit, builder.send())
            .await
            .map_err(|_| timed_out())?
            .map_err(transport)?;
        let status = response.status();
        let body = timeout(limit, response.text()).await;

        if !status.is_success() {
            return Err(LlmError::Http {
                provider,
                status: status.as_u16(),
                body: self.redact(body.ok().and_then(|text| text.ok()).unwrap_or_default()),
            });
        }

        let text = body.map_err(|_| timed_out())?.map_err(transport)?;
        serde_json::from_str(&text).map_err(|_| {
            LlmError::InvalidResponse(format!(
                "{provider} returned non-JSON response ({} chars): {}",
                text.chars().count(),
                self.redact(preview(&text).to_owned()),
            ))
        })
    }

    /// Removes the API key from text that came back from the network, in case
    /// a server or proxy echoes the credentials it was sent.
    fn redact(&self, text: String) -> String {
        match self.config.key() {
            Some(key) if text.contains(key) => text.replace(key, "[REDACTED]"),
            _ => text,
        }
    }
}

#[async_trait]
impl ChatProvider for HttpProvider {
    async fn chat(&self, request: &ChatRequest) -> Result<String> {
        let http_request = build_chat_request(&self.config, request)?;
        // Parsing is inside the retry: an unreadable or empty answer is worth
        // another attempt, as it was in the grading server.
        with_retry(
            self.retry,
            || async {
                let data = self.send(&http_request, self.timeout).await?;
                parse_chat_response(self.config.kind, &data)
            },
            |_, _| {},
        )
        .await
    }
}

/// The error with its causes. reqwest's own message stops at "error sending
/// request"; the reason (connection refused, bad certificate) is in the chain.
/// The URL is dropped because a base URL can carry credentials.
fn describe(error: reqwest::Error) -> String {
    let error = error.without_url();
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}
