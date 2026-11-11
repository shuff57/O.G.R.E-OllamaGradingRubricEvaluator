use std::time::Duration;

use crate::types::ProviderKind;

pub type Result<T> = std::result::Result<T, LlmError>;

/// How much of an error body goes into a message. The full body stays in the error.
const BODY_PREVIEW_CHARS: usize = 200;

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LlmError {
    /// The request never got an HTTP answer: connection refused, DNS, TLS, a dropped socket.
    #[error("{provider} request failed: {message}")]
    Transport {
        provider: ProviderKind,
        message: String,
    },

    #[error("{provider} request timed out after {}s", .timeout.as_secs_f64())]
    Timeout {
        provider: ProviderKind,
        timeout: Duration,
    },

    /// The provider answered with a non-2xx status.
    #[error("{provider} API error {status}: {}", preview(.body))]
    Http {
        provider: ProviderKind,
        status: u16,
        body: String,
    },

    /// The answer was not JSON, or not the JSON this provider is documented to send.
    #[error("{0}")]
    InvalidResponse(String),

    /// The answer was well formed but carried no text.
    #[error("{0} returned an empty reply")]
    EmptyReply(ProviderKind),

    #[error("{0} requires an API key")]
    MissingApiKey(ProviderKind),

    /// The provider has no such operation, such as embeddings on Anthropic.
    #[error("{0}")]
    Unsupported(String),
}

impl LlmError {
    /// The HTTP status, when the provider answered with one.
    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Http { status, .. } => Some(*status),
            _ => None,
        }
    }

    /// Whether trying again could help. Like the grading server, everything is
    /// retried except the client errors 400, 401, 403 and 404; requests that
    /// could not be built at all are never retried.
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Http { status, .. } => !matches!(status, 400 | 401 | 403 | 404),
            Self::MissingApiKey(_) | Self::Unsupported(_) => false,
            Self::Transport { .. }
            | Self::Timeout { .. }
            | Self::InvalidResponse(_)
            | Self::EmptyReply(_) => true,
        }
    }
}

pub(crate) fn preview(text: &str) -> &str {
    match text.char_indices().nth(BODY_PREVIEW_CHARS) {
        Some((end, _)) => &text[..end],
        None => text,
    }
}
