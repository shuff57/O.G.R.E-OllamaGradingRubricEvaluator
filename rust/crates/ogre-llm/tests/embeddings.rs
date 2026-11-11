//! Embedding requests and responses, following
//! `grading-server/test/embedding-adapters.test.js` for the providers this
//! crate speaks.

use ogre_llm::{
    HttpRequest, LlmError, ProviderConfig, ProviderKind, build_embed_request, parse_embed_response,
};
use serde_json::json;

const ANTHROPIC_MESSAGE: &str = "Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini).";

fn ollama(base_url: &str) -> ProviderConfig {
    ProviderConfig::new(ProviderKind::Ollama, "nomic-embed-text").with_base_url(base_url)
}

fn openai() -> ProviderConfig {
    ProviderConfig::new(ProviderKind::OpenAi, "text-embedding-3-small").with_api_key("sk-test")
}

fn gemini() -> ProviderConfig {
    ProviderConfig::new(ProviderKind::Gemini, "text-embedding-004").with_api_key("AIza-test")
}

fn build(config: &ProviderConfig) -> HttpRequest {
    build_embed_request(config, "Hello world").expect("request builds")
}

mod build_embed_request_ollama {
    use super::*;

    #[test]
    fn creates_correct_url_with_base_url() {
        let result = build(&ollama("http://localhost:11434"));
        assert_eq!(result.url, "http://localhost:11434/api/embeddings");
    }

    #[test]
    fn normalizes_trailing_slash_from_base_url() {
        let result = build(&ollama("http://localhost:11434/"));
        assert_eq!(result.url, "http://localhost:11434/api/embeddings");
    }

    #[test]
    fn includes_content_type_header() {
        let result = build(&ollama("http://localhost:11434"));
        assert_eq!(result.header("Content-Type"), Some("application/json"));
    }

    #[test]
    fn includes_authorization_header_when_api_key_provided() {
        let result = build(&ollama("http://localhost:11434").with_api_key("test-key"));
        assert_eq!(result.header("Authorization"), Some("Bearer test-key"));
    }

    #[test]
    fn omits_authorization_header_when_no_api_key() {
        let result = build(&ollama("http://localhost:11434"));
        assert_eq!(result.header("Authorization"), None);
    }

    #[test]
    fn creates_body_with_model_and_prompt() {
        let result = build(&ollama("http://localhost:11434"));
        assert_eq!(
            result.body,
            json!({ "model": "nomic-embed-text", "prompt": "Hello world" })
        );
    }
}

mod build_embed_request_openai {
    use super::*;

    #[test]
    fn creates_correct_url_with_default_base_url() {
        assert_eq!(build(&openai()).url, "https://api.openai.com/v1/embeddings");
    }

    #[test]
    fn uses_custom_api_url_when_provided() {
        let result = build(&openai().with_base_url("https://custom.openai.com"));
        assert_eq!(result.url, "https://custom.openai.com/v1/embeddings");
    }

    #[test]
    fn includes_authorization_header_with_bearer_token() {
        assert_eq!(
            build(&openai()).header("Authorization"),
            Some("Bearer sk-test")
        );
    }

    #[test]
    fn includes_content_type_header() {
        assert_eq!(
            build(&openai()).header("Content-Type"),
            Some("application/json")
        );
    }

    #[test]
    fn creates_body_with_model_and_input() {
        assert_eq!(
            build(&openai()).body,
            json!({ "model": "text-embedding-3-small", "input": "Hello world" })
        );
    }
}

mod build_embed_request_gemini {
    use super::*;

    // Adapted: the key is sent in the `x-goog-api-key` header, not as `?key=`.
    #[test]
    fn creates_correct_url_with_model_and_api_key() {
        let result = build(&gemini());
        assert_eq!(
            result.url,
            "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent"
        );
        assert_eq!(result.header("x-goog-api-key"), Some("AIza-test"));
    }

    #[test]
    fn includes_content_type_header() {
        assert_eq!(
            build(&gemini()).header("Content-Type"),
            Some("application/json")
        );
    }

    #[test]
    fn creates_body_with_content_parts_structure() {
        assert_eq!(
            build(&gemini()).body,
            json!({ "content": { "parts": [{ "text": "Hello world" }] } })
        );
    }
}

#[test]
fn build_for_anthropic_fails_with_descriptive_message() {
    let config = ProviderConfig::new(ProviderKind::Anthropic, "claude-sonnet-4-20250514")
        .with_api_key("sk-ant-test");
    assert_eq!(
        build_embed_request(&config, "Hello world"),
        Err(LlmError::Unsupported(ANTHROPIC_MESSAGE.to_owned()))
    );
}

mod parse_embed_response_ollama {
    use super::*;

    #[test]
    fn extracts_embedding_from_response() {
        let data = json!({ "embedding": [0.1, 0.2, 0.3, 0.4, 0.5] });
        assert_eq!(
            parse_embed_response(ProviderKind::Ollama, &data).unwrap(),
            [0.1, 0.2, 0.3, 0.4, 0.5]
        );
    }

    #[test]
    fn computes_dimensions_from_embedding_length() {
        let data = json!({ "embedding": [0.1, 0.2, 0.3] });
        assert_eq!(
            parse_embed_response(ProviderKind::Ollama, &data)
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn errors_when_embedding_is_missing() {
        assert_eq!(
            parse_embed_response(ProviderKind::Ollama, &json!({})),
            Err(LlmError::InvalidResponse(
                "Invalid ollama embedding response: missing embedding array".to_owned()
            ))
        );
    }
}

mod parse_embed_response_openai {
    use super::*;

    #[test]
    fn extracts_embedding_from_response() {
        let data = json!({ "data": [{ "embedding": [0.1, 0.2, 0.3, 0.4], "index": 0 }] });
        assert_eq!(
            parse_embed_response(ProviderKind::OpenAi, &data).unwrap(),
            [0.1, 0.2, 0.3, 0.4]
        );
    }

    #[test]
    fn computes_dimensions_from_embedding_length() {
        let data = json!({ "data": [{ "embedding": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], "index": 0 }] });
        assert_eq!(
            parse_embed_response(ProviderKind::OpenAi, &data)
                .unwrap()
                .len(),
            6
        );
    }

    #[test]
    fn errors_when_data_is_missing() {
        assert!(parse_embed_response(ProviderKind::OpenAi, &json!({})).is_err());
    }

    #[test]
    fn returns_correct_dimensions_for_large_embedding() {
        let large: Vec<f64> = (0..1536).map(|i| f64::from(i) * 0.001).collect();
        let data = json!({ "data": [{ "embedding": large, "index": 0 }] });
        assert_eq!(
            parse_embed_response(ProviderKind::OpenAi, &data)
                .unwrap()
                .len(),
            1536
        );
    }
}

mod parse_embed_response_gemini {
    use super::*;

    #[test]
    fn extracts_embedding_values_from_response() {
        let data = json!({ "embedding": { "values": [0.5, 0.6, 0.7] } });
        assert_eq!(
            parse_embed_response(ProviderKind::Gemini, &data).unwrap(),
            [0.5, 0.6, 0.7]
        );
    }

    #[test]
    fn computes_dimensions_from_embedding_length() {
        let data = json!({ "embedding": { "values": [0.1, 0.2] } });
        assert_eq!(
            parse_embed_response(ProviderKind::Gemini, &data)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn errors_when_embedding_is_missing() {
        assert!(parse_embed_response(ProviderKind::Gemini, &json!({})).is_err());
    }
}

#[test]
fn parse_for_anthropic_fails_with_descriptive_message() {
    assert_eq!(
        parse_embed_response(ProviderKind::Anthropic, &json!({})),
        Err(LlmError::Unsupported(ANTHROPIC_MESSAGE.to_owned()))
    );
}

#[test]
fn an_embedding_with_a_non_number_is_rejected() {
    let data = json!({ "embedding": [0.1, "oops"] });
    assert!(matches!(
        parse_embed_response(ProviderKind::Ollama, &data),
        Err(LlmError::InvalidResponse(_))
    ));
}
