use async_trait::async_trait;

use crate::error::Result;
use crate::types::ChatRequest;

/// Something that can answer a chat request with text.
#[async_trait]
pub trait ChatProvider: Send + Sync {
    async fn chat(&self, request: &ChatRequest) -> Result<String>;
}
