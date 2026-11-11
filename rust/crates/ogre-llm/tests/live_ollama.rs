//! Against a real Ollama on this machine. Run with `cargo test -p ogre-llm -- --ignored`.
#![cfg(feature = "http")]

use ogre_llm::{ChatProvider, ChatRequest, HttpProvider, Message, ProviderConfig, ProviderKind};

const MODEL: &str = "qwen3:0.6b";

#[tokio::test]
#[ignore = "needs Ollama on localhost:11434 with qwen3:0.6b pulled"]
async fn local_ollama_answers_with_one_word() {
    let provider =
        HttpProvider::new(ProviderConfig::new(ProviderKind::Ollama, MODEL)).expect("client builds");

    let models = provider.list_models().await.expect("Ollama is reachable");
    assert!(models.iter().any(|name| name == MODEL), "{models:?}");

    let request = ChatRequest::new([Message::user(
        "Reply with exactly one word: the color of a clear daytime sky.",
    )]);
    let reply = provider.chat(&request).await.expect("chat succeeds");

    println!("{MODEL} replied: {reply:?}");
    assert!(!reply.trim().is_empty());
}
