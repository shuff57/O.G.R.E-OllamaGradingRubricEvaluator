//! Talking to AI providers: Ollama, OpenAI-compatible servers, Anthropic and
//! Google Gemini.
//!
//! The crate has two layers. The pure one turns a [`ProviderConfig`] and a
//! provider-neutral [`ChatRequest`] into an [`HttpRequest`], and turns a
//! provider's JSON answer back into text. It does no I/O and builds for wasm.
//! The `http` feature (on by default) adds [`HttpProvider`], which sends those
//! requests with reqwest, with the timeouts and retries the grading server used.

mod error;
#[cfg(feature = "http")]
mod http;
mod provider;
mod request;
mod response;
mod retry;
mod types;

pub use error::{LlmError, Result};
#[cfg(feature = "http")]
pub use http::HttpProvider;
pub use provider::ChatProvider;
pub use request::{build_chat_request, build_embed_request, build_list_models_request};
pub use response::{parse_chat_response, parse_embed_response, parse_model_list};
pub use retry::RetryPolicy;
#[cfg(feature = "http")]
pub use retry::with_retry;
pub use types::{
    ChatRequest, HttpMethod, HttpRequest, Image, Message, ProviderConfig, ProviderKind,
    ProviderOptions, Role,
};
