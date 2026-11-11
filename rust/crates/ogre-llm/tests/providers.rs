//! Request building and response parsing. The `ported` module follows
//! `grading-server/test/providers.test.js` case by case; the rest covers what
//! that file left untested.

use ogre_llm::{
    ChatRequest, HttpMethod, HttpRequest, Image, LlmError, Message, ProviderConfig, ProviderKind,
    ProviderOptions, build_chat_request, build_list_models_request, parse_chat_response,
    parse_model_list,
};
use serde_json::{Value, json};

fn messages() -> ChatRequest {
    ChatRequest::new([
        Message::system("You are a grading assistant."),
        Message::user("Grade this work."),
    ])
}

fn ollama(base_url: &str) -> ProviderConfig {
    ProviderConfig::new(ProviderKind::Ollama, "llama3").with_base_url(base_url)
}

fn openai() -> ProviderConfig {
    ProviderConfig::new(ProviderKind::OpenAi, "gpt-4o").with_api_key("sk-test")
}

fn anthropic() -> ProviderConfig {
    ProviderConfig::new(ProviderKind::Anthropic, "claude-sonnet-4-20250514")
        .with_api_key("sk-ant-test")
}

fn gemini() -> ProviderConfig {
    ProviderConfig::new(ProviderKind::Gemini, "gemini-1.5-pro").with_api_key("AIza-test")
}

fn with_temperature(config: ProviderConfig, temperature: f64) -> ProviderConfig {
    config.with_options(ProviderOptions {
        temperature: Some(temperature),
        ..ProviderOptions::default()
    })
}

fn build(config: &ProviderConfig, request: &ChatRequest) -> HttpRequest {
    build_chat_request(config, request).expect("request builds")
}

fn invalid_message(kind: ProviderKind, data: Value) -> String {
    match parse_chat_response(kind, &data) {
        Err(LlmError::InvalidResponse(message)) => message,
        other => panic!("expected InvalidResponse, got {other:?}"),
    }
}

mod ported {
    use super::*;

    mod build_ollama_request {
        use super::*;

        #[test]
        fn creates_correct_url_with_base_url() {
            let result = build(&ollama("https://api.ollama.com"), &messages());
            assert_eq!(result.url, "https://api.ollama.com/api/chat");
        }

        #[test]
        fn includes_authorization_header_when_api_key_provided() {
            let config = ollama("https://api.ollama.com").with_api_key("test-key");
            let result = build(&config, &messages());
            assert_eq!(result.header("Authorization"), Some("Bearer test-key"));
        }

        #[test]
        fn omits_authorization_header_when_no_api_key() {
            let result = build(&ollama("http://localhost:11434"), &messages());
            assert_eq!(result.header("Authorization"), None);
        }

        #[test]
        fn includes_content_type_header() {
            let result = build(&ollama("https://api.ollama.com"), &messages());
            assert_eq!(result.header("Content-Type"), Some("application/json"));
        }

        #[test]
        fn creates_body_with_model_and_messages() {
            let result = build(&ollama("https://api.ollama.com"), &messages());
            assert_eq!(result.body["model"], "llama3");
            assert_eq!(
                result.body["messages"],
                json!([
                    { "role": "system", "content": "You are a grading assistant." },
                    { "role": "user", "content": "Grade this work." },
                ])
            );
            assert_eq!(result.body["stream"], false);
        }

        #[test]
        fn normalizes_base_url_by_removing_trailing_slash() {
            let result = build(&ollama("https://api.ollama.com/"), &messages());
            assert_eq!(result.url, "https://api.ollama.com/api/chat");
        }
    }

    mod build_openai_request {
        use super::*;

        #[test]
        fn creates_correct_url() {
            let result = build(&openai(), &messages());
            assert_eq!(result.url, "https://api.openai.com/v1/chat/completions");
        }

        #[test]
        fn includes_authorization_header_with_bearer_token() {
            let result = build(&openai(), &messages());
            assert_eq!(result.header("Authorization"), Some("Bearer sk-test"));
        }

        #[test]
        fn includes_content_type_header() {
            let result = build(&openai(), &messages());
            assert_eq!(result.header("Content-Type"), Some("application/json"));
        }

        #[test]
        fn creates_body_with_model_and_messages() {
            let result = build(&openai(), &messages());
            assert_eq!(result.body["model"], "gpt-4o");
            assert_eq!(
                result.body["messages"],
                json!([
                    { "role": "system", "content": "You are a grading assistant." },
                    { "role": "user", "content": "Grade this work." },
                ])
            );
            assert_eq!(result.body["stream"], false);
        }
    }

    mod build_anthropic_request {
        use super::*;

        #[test]
        fn creates_correct_url() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.url, "https://api.anthropic.com/v1/messages");
        }

        #[test]
        fn includes_x_api_key_header() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.header("x-api-key"), Some("sk-ant-test"));
        }

        #[test]
        fn includes_anthropic_version_header() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.header("anthropic-version"), Some("2023-06-01"));
        }

        #[test]
        fn includes_content_type_header() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.header("Content-Type"), Some("application/json"));
        }

        #[test]
        fn separates_system_message_from_user_messages() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.body["system"], "You are a grading assistant.");
            assert_eq!(
                result.body["messages"],
                json!([{ "role": "user", "content": "Grade this work." }])
            );
        }

        #[test]
        fn includes_model_and_max_tokens() {
            let result = build(&anthropic(), &messages());
            assert_eq!(result.body["model"], "claude-sonnet-4-20250514");
            assert_eq!(result.body["max_tokens"], 16000);
        }

        #[test]
        fn handles_messages_without_system_message() {
            let request = ChatRequest::new([Message::user("Grade this work.")]);
            let result = build(&anthropic(), &request);
            assert!(result.body.get("system").is_none());
            assert_eq!(
                result.body["messages"],
                json!([{ "role": "user", "content": "Grade this work." }])
            );
        }
    }

    mod build_google_gemini_request {
        use super::*;

        // Adapted: the JS put the key in the URL (`?key=AIza-test`). Here it
        // travels in the `x-goog-api-key` header and the URL stays clean.
        #[test]
        fn creates_correct_url_with_api_key() {
            let result = build(&gemini(), &messages());
            assert_eq!(
                result.url,
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent"
            );
            assert_eq!(result.header("x-goog-api-key"), Some("AIza-test"));
        }

        #[test]
        fn includes_content_type_header() {
            let result = build(&gemini(), &messages());
            assert_eq!(result.header("Content-Type"), Some("application/json"));
        }

        #[test]
        fn converts_system_message_to_system_instruction() {
            let result = build(&gemini(), &messages());
            assert_eq!(
                result.body["systemInstruction"],
                json!({ "parts": [{ "text": "You are a grading assistant." }] })
            );
        }

        #[test]
        fn converts_user_messages_to_gemini_format() {
            let result = build(&gemini(), &messages());
            assert_eq!(
                result.body["contents"],
                json!([{ "role": "user", "parts": [{ "text": "Grade this work." }] }])
            );
        }

        #[test]
        fn converts_assistant_role_to_model_role() {
            let request =
                ChatRequest::new([Message::user("Hello"), Message::assistant("Hi there")]);
            let result = build(&gemini(), &request);
            assert_eq!(
                result.body["contents"],
                json!([
                    { "role": "user", "parts": [{ "text": "Hello" }] },
                    { "role": "model", "parts": [{ "text": "Hi there" }] },
                ])
            );
        }

        #[test]
        fn handles_messages_without_system_message() {
            let request = ChatRequest::new([Message::user("Grade this work.")]);
            let result = build(&gemini(), &request);
            assert!(result.body.get("systemInstruction").is_none());
            assert_eq!(
                result.body["contents"],
                json!([{ "role": "user", "parts": [{ "text": "Grade this work." }] }])
            );
        }
    }

    mod parse_ollama_response {
        use super::*;

        const MISSING: &str = "Invalid Ollama response: missing message.content";

        #[test]
        fn extracts_content_from_valid_response() {
            let data = json!({
                "message": { "role": "assistant", "content": "Score: 8/10\nGood work!" }
            });
            assert_eq!(
                parse_chat_response(ProviderKind::Ollama, &data).unwrap(),
                "Score: 8/10\nGood work!"
            );
        }

        #[test]
        fn errors_when_message_is_missing() {
            assert_eq!(invalid_message(ProviderKind::Ollama, json!({})), MISSING);
        }

        #[test]
        fn errors_when_content_is_missing() {
            let data = json!({ "message": { "role": "assistant" } });
            assert_eq!(invalid_message(ProviderKind::Ollama, data), MISSING);
        }
    }

    mod parse_openai_response {
        use super::*;

        const MISSING: &str = "Invalid OpenAI response: missing choices[0].message.content";

        #[test]
        fn extracts_content_from_valid_response() {
            let data = json!({
                "choices": [{
                    "message": { "role": "assistant", "content": "Score: 9/10\nExcellent!" }
                }]
            });
            assert_eq!(
                parse_chat_response(ProviderKind::OpenAi, &data).unwrap(),
                "Score: 9/10\nExcellent!"
            );
        }

        #[test]
        fn errors_when_choices_is_missing() {
            assert_eq!(invalid_message(ProviderKind::OpenAi, json!({})), MISSING);
        }

        #[test]
        fn errors_when_choices_is_empty() {
            let data = json!({ "choices": [] });
            assert_eq!(invalid_message(ProviderKind::OpenAi, data), MISSING);
        }

        #[test]
        fn errors_when_message_is_missing() {
            let data = json!({ "choices": [{}] });
            assert_eq!(invalid_message(ProviderKind::OpenAi, data), MISSING);
        }

        #[test]
        fn errors_when_content_is_missing() {
            let data = json!({ "choices": [{ "message": { "role": "assistant" } }] });
            assert_eq!(invalid_message(ProviderKind::OpenAi, data), MISSING);
        }
    }

    mod parse_anthropic_response {
        use super::*;

        const MISSING: &str = "Invalid Anthropic response: missing content[0].text";

        #[test]
        fn extracts_text_from_valid_response() {
            let data = json!({
                "content": [{ "type": "text", "text": "Score: 7/10\nNeeds improvement." }]
            });
            assert_eq!(
                parse_chat_response(ProviderKind::Anthropic, &data).unwrap(),
                "Score: 7/10\nNeeds improvement."
            );
        }

        #[test]
        fn errors_when_content_is_missing() {
            assert_eq!(invalid_message(ProviderKind::Anthropic, json!({})), MISSING);
        }

        #[test]
        fn errors_when_content_is_empty() {
            let data = json!({ "content": [] });
            assert_eq!(invalid_message(ProviderKind::Anthropic, data), MISSING);
        }

        #[test]
        fn errors_when_text_is_missing() {
            let data = json!({ "content": [{ "type": "text" }] });
            assert_eq!(invalid_message(ProviderKind::Anthropic, data), MISSING);
        }
    }

    mod parse_google_gemini_response {
        use super::*;

        const MISSING: &str =
            "Invalid Google Gemini response: missing candidates[0].content.parts[0].text";

        #[test]
        fn extracts_text_from_valid_response() {
            let data = json!({
                "candidates": [{ "content": { "parts": [{ "text": "Score: 10/10\nPerfect!" }] } }]
            });
            assert_eq!(
                parse_chat_response(ProviderKind::Gemini, &data).unwrap(),
                "Score: 10/10\nPerfect!"
            );
        }

        #[test]
        fn errors_when_candidates_is_missing() {
            assert_eq!(invalid_message(ProviderKind::Gemini, json!({})), MISSING);
        }

        #[test]
        fn errors_when_candidates_is_empty() {
            let data = json!({ "candidates": [] });
            assert_eq!(invalid_message(ProviderKind::Gemini, data), MISSING);
        }

        #[test]
        fn errors_when_content_is_missing() {
            let data = json!({ "candidates": [{}] });
            assert_eq!(invalid_message(ProviderKind::Gemini, data), MISSING);
        }

        #[test]
        fn errors_when_parts_is_missing() {
            let data = json!({ "candidates": [{ "content": {} }] });
            assert_eq!(invalid_message(ProviderKind::Gemini, data), MISSING);
        }

        #[test]
        fn errors_when_parts_is_empty() {
            let data = json!({ "candidates": [{ "content": { "parts": [] } }] });
            assert_eq!(invalid_message(ProviderKind::Gemini, data), MISSING);
        }

        #[test]
        fn errors_when_text_is_missing() {
            let data = json!({ "candidates": [{ "content": { "parts": [{}] } }] });
            assert_eq!(invalid_message(ProviderKind::Gemini, data), MISSING);
        }
    }

    mod temperature {
        use super::*;

        fn request() -> ChatRequest {
            ChatRequest::new([Message::user("Grade this.")])
        }

        #[test]
        fn ollama_default_temperature_is_0_2() {
            let result = build(&ollama("http://localhost:11434"), &request());
            assert_eq!(result.body["options"]["temperature"], 0.2);
        }

        #[test]
        fn ollama_accepts_custom_temperature() {
            let config = with_temperature(ollama("http://localhost:11434"), 0.5);
            let result = build(&config, &request());
            assert_eq!(result.body["options"]["temperature"], 0.5);
        }

        #[test]
        fn openai_default_temperature_is_0_2() {
            let result = build(&openai(), &request());
            assert_eq!(result.body["temperature"], 0.2);
        }

        #[test]
        fn openai_accepts_custom_temperature() {
            let result = build(&with_temperature(openai(), 0.7), &request());
            assert_eq!(result.body["temperature"], 0.7);
        }

        // Adapted: the JS defaulted Anthropic to 0.2 as well. Current Claude
        // models answer 400 to any temperature, so none is sent unless asked for.
        #[test]
        fn anthropic_sends_no_temperature_by_default() {
            let result = build(&anthropic(), &request());
            assert!(result.body.get("temperature").is_none());
        }

        #[test]
        fn anthropic_accepts_custom_temperature() {
            let result = build(&with_temperature(anthropic(), 0.1), &request());
            assert_eq!(result.body["temperature"], 0.1);
        }

        #[test]
        fn google_gemini_default_temperature_is_0_2() {
            let result = build(&gemini(), &request());
            assert_eq!(result.body["generationConfig"]["temperature"], 0.2);
        }

        #[test]
        fn google_gemini_accepts_custom_temperature() {
            let result = build(&with_temperature(gemini(), 0.3), &request());
            assert_eq!(result.body["generationConfig"]["temperature"], 0.3);
        }
    }
}

fn png() -> Image {
    Image::from_data_url("data:image/png;base64,Zm9vYmFy").expect("a data URL")
}

fn with_image() -> ChatRequest {
    ChatRequest::new([Message::user("Look at this").with_image(png())])
}

#[test]
fn ollama_body_carries_the_grading_server_defaults() {
    let result = build(&ollama("http://localhost:11434"), &messages());
    assert_eq!(result.method, HttpMethod::Post);
    assert_eq!(result.body["think"], false);
    assert_eq!(result.body["keep_alive"], "60m");
    assert_eq!(
        result.body["options"],
        json!({ "temperature": 0.2, "num_ctx": 8192 })
    );
    assert!(result.body.get("format").is_none());
}

#[test]
fn ollama_options_can_be_overridden() {
    let config = ollama("http://localhost:11434").with_options(ProviderOptions {
        temperature: Some(0.0),
        max_tokens: Some(512),
        num_ctx: Some(4096),
        keep_alive: Some("5m".to_owned()),
    });
    let result = build(&config, &messages());
    assert_eq!(result.body["keep_alive"], "5m");
    assert_eq!(
        result.body["options"],
        json!({ "temperature": 0.0, "num_ctx": 4096, "num_predict": 512 })
    );
}

#[test]
fn ollama_cloud_uses_the_same_protocol_with_a_bearer_key() {
    let config = ProviderConfig::new(ProviderKind::OllamaCloud, "gpt-oss:120b").with_api_key("k");
    let result = build(&config, &messages());
    assert_eq!(result.url, "https://ollama.com/api/chat");
    assert_eq!(result.header("authorization"), Some("Bearer k"));
    assert_eq!(result.body["model"], "gpt-oss:120b");
}

#[test]
fn an_empty_api_key_counts_as_no_key() {
    let result = build(
        &ollama("http://localhost:11434").with_api_key(""),
        &messages(),
    );
    assert_eq!(result.header("Authorization"), None);
}

// Same input as the RunPod multimodal case in the JS suite, which shared this
// transformation with the Ollama builder.
#[test]
fn ollama_sends_images_as_raw_base64_beside_the_text() {
    let result = build(&ollama("http://localhost:11434"), &with_image());
    assert_eq!(
        result.body["messages"],
        json!([{ "role": "user", "content": "Look at this", "images": ["Zm9vYmFy"] }])
    );
}

#[test]
fn openai_sends_images_as_data_urls() {
    let result = build(&openai(), &with_image());
    assert_eq!(
        result.body["messages"],
        json!([{
            "role": "user",
            "content": [
                { "type": "text", "text": "Look at this" },
                { "type": "image_url", "image_url": { "url": "data:image/png;base64,Zm9vYmFy" } },
            ],
        }])
    );
}

#[test]
fn anthropic_sends_images_as_base64_sources() {
    let result = build(&anthropic(), &with_image());
    assert_eq!(
        result.body["messages"],
        json!([{
            "role": "user",
            "content": [
                { "type": "text", "text": "Look at this" },
                {
                    "type": "image",
                    "source": { "type": "base64", "media_type": "image/png", "data": "Zm9vYmFy" },
                },
            ],
        }])
    );
}

#[test]
fn gemini_sends_images_as_inline_data() {
    let result = build(&gemini(), &with_image());
    assert_eq!(
        result.body["contents"],
        json!([{
            "role": "user",
            "parts": [
                { "text": "Look at this" },
                { "inline_data": { "mime_type": "image/png", "data": "Zm9vYmFy" } },
            ],
        }])
    );
}

#[test]
fn an_image_without_text_sends_no_empty_text_part() {
    let request = ChatRequest::new([Message::user("").with_image(png())]);
    let content = &build(&anthropic(), &request).body["messages"][0]["content"];
    assert_eq!(content.as_array().map(Vec::len), Some(1));
    assert_eq!(content[0]["type"], "image");
}

#[test]
fn image_data_urls_round_trip() {
    let image = png();
    assert_eq!(image, Image::new("image/png", "Zm9vYmFy"));
    assert_eq!(image.to_data_url(), "data:image/png;base64,Zm9vYmFy");
    assert_eq!(Image::from_data_url("https://example.com/a.png"), None);
}

#[test]
fn json_mode_uses_each_providers_own_switch() {
    let request = messages().with_json(true);

    let ollama = build(&ollama("http://localhost:11434"), &request);
    assert_eq!(ollama.body["format"], "json");

    let openai = build(&openai(), &request);
    assert_eq!(
        openai.body["response_format"],
        json!({ "type": "json_object" })
    );

    let gemini = build(&gemini(), &request);
    assert_eq!(
        gemini.body["generationConfig"]["responseMimeType"],
        "application/json"
    );

    // Anthropic has no schema-free JSON switch; the request is unchanged.
    assert_eq!(
        build(&anthropic(), &request).body,
        build(&anthropic(), &messages()).body
    );
}

#[test]
fn token_limits_map_to_each_providers_field() {
    let limit = |config: ProviderConfig| {
        config.with_options(ProviderOptions {
            max_tokens: Some(2048),
            ..ProviderOptions::default()
        })
    };
    assert_eq!(build(&openai(), &messages()).body["max_tokens"], 16000);
    assert_eq!(
        build(&limit(openai()), &messages()).body["max_tokens"],
        2048
    );
    assert_eq!(
        build(&limit(anthropic()), &messages()).body["max_tokens"],
        2048
    );

    let gemini_default = build(&gemini(), &messages());
    assert!(
        gemini_default.body["generationConfig"]
            .get("maxOutputTokens")
            .is_none()
    );
    let gemini_limited = build(&limit(gemini()), &messages());
    assert_eq!(
        gemini_limited.body["generationConfig"]["maxOutputTokens"],
        2048
    );
}

#[test]
fn openai_compatible_servers_use_the_configured_base_url() {
    let local = ProviderConfig::new(ProviderKind::OpenAi, "local-model")
        .with_base_url("http://localhost:1234/");
    let result = build(&local, &messages());
    assert_eq!(result.url, "http://localhost:1234/v1/chat/completions");
    assert_eq!(result.header("Authorization"), None);

    let with_v1 = local.with_base_url("http://localhost:1234/v1");
    assert_eq!(
        build(&with_v1, &messages()).url,
        "http://localhost:1234/v1/chat/completions"
    );
}

#[test]
fn several_system_messages_are_all_kept() {
    let request = ChatRequest::new([
        Message::system("Be fair."),
        Message::system("Answer in JSON."),
        Message::user("Grade this work."),
    ]);
    assert_eq!(
        build(&anthropic(), &request).body["system"],
        "Be fair.\n\nAnswer in JSON."
    );
    assert_eq!(
        build(&gemini(), &request).body["systemInstruction"]["parts"][0]["text"],
        "Be fair.\n\nAnswer in JSON."
    );
}

#[test]
fn anthropic_and_gemini_need_a_key() {
    for kind in [ProviderKind::Anthropic, ProviderKind::Gemini] {
        let config = ProviderConfig::new(kind, "some-model");
        assert_eq!(
            build_chat_request(&config, &messages()),
            Err(LlmError::MissingApiKey(kind))
        );
    }
}

#[test]
fn ollama_falls_back_to_thinking_when_content_is_empty() {
    let data = json!({ "message": { "role": "assistant", "content": "", "thinking": "Score: 7" } });
    assert_eq!(
        parse_chat_response(ProviderKind::Ollama, &data).unwrap(),
        "Score: 7"
    );
}

#[test]
fn ollama_falls_back_to_thinking_when_content_is_missing() {
    let data = json!({ "message": { "role": "assistant", "thinking": "Score: 7" } });
    assert_eq!(
        parse_chat_response(ProviderKind::OllamaCloud, &data).unwrap(),
        "Score: 7"
    );
}

#[test]
fn ollama_prefers_content_over_thinking() {
    let data = json!({ "message": { "content": "Score: 9", "thinking": "Let me think" } });
    assert_eq!(
        parse_chat_response(ProviderKind::Ollama, &data).unwrap(),
        "Score: 9"
    );
}

#[test]
fn a_reply_with_no_text_is_an_empty_reply() {
    let ollama = json!({ "message": { "role": "assistant", "content": "" } });
    assert_eq!(
        parse_chat_response(ProviderKind::Ollama, &ollama),
        Err(LlmError::EmptyReply(ProviderKind::Ollama))
    );

    let openai = json!({ "choices": [{ "message": { "content": "" } }] });
    assert_eq!(
        parse_chat_response(ProviderKind::OpenAi, &openai),
        Err(LlmError::EmptyReply(ProviderKind::OpenAi))
    );
}

#[test]
fn anthropic_skips_thinking_blocks_and_joins_text_blocks() {
    let data = json!({
        "content": [
            { "type": "thinking", "thinking": "", "signature": "abc" },
            { "type": "text", "text": "Score: 7/10\n" },
            { "type": "text", "text": "Needs improvement." },
        ],
        "stop_reason": "end_turn",
    });
    assert_eq!(
        parse_chat_response(ProviderKind::Anthropic, &data).unwrap(),
        "Score: 7/10\nNeeds improvement."
    );
}

#[test]
fn a_reply_without_text_reports_why_the_provider_stopped() {
    let refusal = json!({ "content": [], "stop_reason": "refusal" });
    assert_eq!(
        invalid_message(ProviderKind::Anthropic, refusal),
        "Invalid Anthropic response: missing content[0].text (stop_reason: refusal)"
    );

    let blocked = json!({ "candidates": [{ "finishReason": "SAFETY" }] });
    assert_eq!(
        invalid_message(ProviderKind::Gemini, blocked),
        "Invalid Google Gemini response: missing candidates[0].content.parts[0].text (finishReason: SAFETY)"
    );
}

#[test]
fn gemini_skips_thought_parts() {
    let data = json!({
        "candidates": [{
            "content": { "parts": [{ "text": "hmm", "thought": true }, { "text": "Score: 10" }] }
        }]
    });
    assert_eq!(
        parse_chat_response(ProviderKind::Gemini, &data).unwrap(),
        "Score: 10"
    );
}

#[test]
fn list_models_request_and_response() {
    let config = ollama("http://localhost:11434/").with_api_key("k");
    let request = build_list_models_request(&config).unwrap();
    assert_eq!(request.method, HttpMethod::Get);
    assert_eq!(request.url, "http://localhost:11434/api/tags");
    assert_eq!(request.header("Authorization"), Some("Bearer k"));
    assert_eq!(request.body, Value::Null);

    let data =
        json!({ "models": [{ "name": "llama3:latest", "size": 1 }, { "name": "qwen3:0.6b" }] });
    assert_eq!(
        parse_model_list(&data).unwrap(),
        ["llama3:latest", "qwen3:0.6b"]
    );
    assert!(matches!(
        parse_model_list(&json!({})),
        Err(LlmError::InvalidResponse(_))
    ));
    assert!(matches!(
        build_list_models_request(&openai()),
        Err(LlmError::Unsupported(_))
    ));
}

#[test]
fn provider_kinds_map_from_grading_server_ids() {
    assert_eq!(
        ProviderKind::from_js_id("ollama"),
        Some(ProviderKind::Ollama)
    );
    assert_eq!(
        ProviderKind::from_js_id("Ollama-Local"),
        Some(ProviderKind::Ollama)
    );
    assert_eq!(
        ProviderKind::from_js_id("ogre-cloud"),
        Some(ProviderKind::OllamaCloud)
    );
    assert_eq!(
        ProviderKind::from_js_id("openai"),
        Some(ProviderKind::OpenAi)
    );
    assert_eq!(
        ProviderKind::from_js_id("anthropic"),
        Some(ProviderKind::Anthropic)
    );
    assert_eq!(
        ProviderKind::from_js_id("google-gemini"),
        Some(ProviderKind::Gemini)
    );
    // RunPod and Copilot in the grading server; neither is spoken here.
    assert_eq!(ProviderKind::from_js_id("ollama-cloud"), None);
    assert_eq!(ProviderKind::from_js_id("github-models"), None);
}

#[test]
fn timeouts_match_the_grading_server() {
    let secs = |kind: ProviderKind| kind.default_timeout().as_secs();
    assert_eq!(secs(ProviderKind::Ollama), 600);
    assert_eq!(secs(ProviderKind::OllamaCloud), 480);
    assert_eq!(secs(ProviderKind::OpenAi), 30);
    assert_eq!(secs(ProviderKind::Anthropic), 30);
    assert_eq!(secs(ProviderKind::Gemini), 30);
}

#[test]
fn debug_output_never_shows_the_api_key() {
    for config in [
        ollama("http://localhost:11434").with_api_key("sk-secret-123"),
        openai().with_api_key("sk-secret-123"),
        anthropic().with_api_key("sk-secret-123"),
        gemini().with_api_key("sk-secret-123"),
    ] {
        let request = build(&config, &messages());
        let shown = format!("{config:?} {request:?} {request:#?}");
        assert!(!shown.contains("sk-secret-123"), "{shown}");
        assert!(shown.contains("[REDACTED]"));
        assert!(!request.url.contains("sk-secret-123"));
    }
}

#[test]
fn http_errors_show_at_most_200_characters_of_the_body() {
    let error = LlmError::Http {
        provider: ProviderKind::Ollama,
        status: 500,
        body: "é".repeat(300),
    };
    assert_eq!(
        error.to_string(),
        format!("ollama API error 500: {}", "é".repeat(200))
    );
    assert_eq!(error.status(), Some(500));
}
