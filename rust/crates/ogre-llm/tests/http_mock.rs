//! `HttpProvider` against a canned HTTP server on a loopback port.
#![cfg(feature = "http")]

use std::time::{Duration, Instant};

use ogre_llm::{
    ChatProvider, ChatRequest, HttpProvider, Image, LlmError, Message, ProviderConfig,
    ProviderKind, RetryPolicy,
};
use serde_json::json;

use server::{MockServer, Reply};

const FAST_RETRY: RetryPolicy = RetryPolicy {
    max_retries: 3,
    base_delay: Duration::from_millis(10),
};

fn provider(server: &MockServer, kind: ProviderKind, model: &str) -> HttpProvider {
    provider_for(ProviderConfig::new(kind, model).with_base_url(server.url()))
}

fn provider_for(config: ProviderConfig) -> HttpProvider {
    HttpProvider::new(config)
        .expect("client builds")
        .with_retry_policy(FAST_RETRY)
}

fn grade_request() -> ChatRequest {
    ChatRequest::new([
        Message::system("You are a grading assistant."),
        Message::user("Grade this work."),
    ])
}

fn ollama_reply(content: &str) -> Reply {
    Reply::json(json!({ "message": { "role": "assistant", "content": content }, "done": true }))
}

#[tokio::test]
async fn ollama_chat_succeeds() {
    let server = MockServer::start([ollama_reply("Score: 8/10")]).await;
    // Through the trait object, as callers will hold it.
    let provider: Box<dyn ChatProvider> =
        Box::new(provider(&server, ProviderKind::Ollama, "llama3"));

    let reply = provider.chat(&grade_request()).await.unwrap();

    assert_eq!(reply, "Score: 8/10");
    let received = server.received();
    assert_eq!(received.len(), 1);
    assert_eq!(received[0].method, "POST");
    assert_eq!(received[0].path, "/api/chat");
    assert_eq!(received[0].header("content-type"), Some("application/json"));
    assert_eq!(received[0].header("authorization"), None);
    assert_eq!(
        received[0].json(),
        json!({
            "model": "llama3",
            "messages": [
                { "role": "system", "content": "You are a grading assistant." },
                { "role": "user", "content": "Grade this work." },
            ],
            "stream": false,
            "think": false,
            "keep_alive": "60m",
            "options": { "temperature": 0.2, "num_ctx": 8192 },
        })
    );
}

#[tokio::test]
async fn ollama_cloud_chat_sends_the_bearer_key() {
    let server = MockServer::start([ollama_reply("ok")]).await;
    let config = ProviderConfig::new(ProviderKind::OllamaCloud, "gpt-oss:120b")
        .with_base_url(server.url())
        .with_api_key("ollama-key");

    let reply = provider_for(config).chat(&grade_request()).await.unwrap();

    assert_eq!(reply, "ok");
    let received = server.received();
    assert_eq!(received[0].path, "/api/chat");
    assert_eq!(
        received[0].header("authorization"),
        Some("Bearer ollama-key")
    );
    assert_eq!(received[0].json()["model"], "gpt-oss:120b");
}

#[tokio::test]
async fn openai_chat_succeeds() {
    let server = MockServer::start([Reply::json(json!({
        "choices": [{ "message": { "role": "assistant", "content": "{\"score\": 9}" } }]
    }))])
    .await;
    let config = ProviderConfig::new(ProviderKind::OpenAi, "gpt-4o")
        .with_base_url(server.url())
        .with_api_key("sk-test");

    let reply = provider_for(config)
        .chat(&grade_request().with_json(true))
        .await
        .unwrap();

    assert_eq!(reply, "{\"score\": 9}");
    let received = server.received();
    assert_eq!(received[0].path, "/v1/chat/completions");
    assert_eq!(received[0].header("authorization"), Some("Bearer sk-test"));
    assert_eq!(
        received[0].json(),
        json!({
            "model": "gpt-4o",
            "max_tokens": 16000,
            "messages": [
                { "role": "system", "content": "You are a grading assistant." },
                { "role": "user", "content": "Grade this work." },
            ],
            "stream": false,
            "temperature": 0.2,
            "response_format": { "type": "json_object" },
        })
    );
}

#[tokio::test]
async fn anthropic_chat_succeeds() {
    let server = MockServer::start([Reply::json(json!({
        "content": [
            { "type": "thinking", "thinking": "" },
            { "type": "text", "text": "Score: 7/10" },
        ],
        "stop_reason": "end_turn",
    }))])
    .await;
    let config = ProviderConfig::new(ProviderKind::Anthropic, "claude-test-model")
        .with_base_url(server.url())
        .with_api_key("sk-ant-test");
    let request = ChatRequest::new([
        Message::system("You are a grading assistant."),
        Message::user("Grade this work.").with_image(Image::new("image/png", "Zm9vYmFy")),
    ]);

    let reply = provider_for(config).chat(&request).await.unwrap();

    assert_eq!(reply, "Score: 7/10");
    let received = server.received();
    assert_eq!(received[0].path, "/v1/messages");
    assert_eq!(received[0].header("x-api-key"), Some("sk-ant-test"));
    assert_eq!(received[0].header("anthropic-version"), Some("2023-06-01"));
    assert_eq!(received[0].header("authorization"), None);
    assert_eq!(
        received[0].json(),
        json!({
            "model": "claude-test-model",
            "max_tokens": 16000,
            "system": "You are a grading assistant.",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": "Grade this work." },
                    {
                        "type": "image",
                        "source": { "type": "base64", "media_type": "image/png", "data": "Zm9vYmFy" },
                    },
                ],
            }],
        })
    );
}

#[tokio::test]
async fn gemini_chat_succeeds() {
    let server = MockServer::start([Reply::json(json!({
        "candidates": [{ "content": { "parts": [{ "text": "Score: 10/10" }] } }]
    }))])
    .await;
    let config = ProviderConfig::new(ProviderKind::Gemini, "gemini-test-model")
        .with_base_url(server.url())
        .with_api_key("AIza-test");

    let reply = provider_for(config).chat(&grade_request()).await.unwrap();

    assert_eq!(reply, "Score: 10/10");
    let received = server.received();
    // The key is in a header; the path has no query string to leak it.
    assert_eq!(
        received[0].path,
        "/v1beta/models/gemini-test-model:generateContent"
    );
    assert_eq!(received[0].header("x-goog-api-key"), Some("AIza-test"));
    assert_eq!(
        received[0].json(),
        json!({
            "contents": [{ "role": "user", "parts": [{ "text": "Grade this work." }] }],
            "generationConfig": { "temperature": 0.2 },
            "systemInstruction": { "parts": [{ "text": "You are a grading assistant." }] },
        })
    );
}

// The message format is the one `cloud-fallback.test.js` expects for a 404
// from local Ollama, and like there the request is not repeated.
#[tokio::test]
async fn http_error_carries_status_and_body_and_is_not_retried() {
    let server = MockServer::start([Reply::status(404, "model not found")]).await;
    let provider = provider(&server, ProviderKind::Ollama, "missing-model");

    let error = provider.chat(&grade_request()).await.unwrap_err();

    assert_eq!(
        error,
        LlmError::Http {
            provider: ProviderKind::Ollama,
            status: 404,
            body: "model not found".to_owned(),
        }
    );
    assert_eq!(error.to_string(), "ollama API error 404: model not found");
    assert_eq!(server.received().len(), 1);
}

#[tokio::test]
async fn retry_succeeds_on_the_second_attempt() {
    let server = MockServer::start([
        Reply::status(503, "model is loading"),
        ollama_reply("recovered"),
    ])
    .await;
    let provider = provider(&server, ProviderKind::Ollama, "llama3");

    let reply = provider.chat(&grade_request()).await.unwrap();

    assert_eq!(reply, "recovered");
    let received = server.received();
    assert_eq!(received.len(), 2);
    assert_eq!(received[0].body, received[1].body);
}

// Same status and body as the 500 case in `cloud-fallback.test.js`.
#[tokio::test]
async fn the_last_error_is_returned_when_retries_run_out() {
    let server = MockServer::start(vec![Reply::status(500, "server exploded"); 3]).await;
    let provider =
        provider(&server, ProviderKind::Ollama, "llama3").with_retry_policy(RetryPolicy {
            max_retries: 2,
            ..FAST_RETRY
        });

    let error = provider.chat(&grade_request()).await.unwrap_err();

    assert_eq!(error.to_string(), "ollama API error 500: server exploded");
    assert_eq!(server.received().len(), 3);
}

#[tokio::test]
async fn slow_response_times_out() {
    let server = MockServer::start([ollama_reply("too late").after(Duration::from_secs(5))]).await;
    let limit = Duration::from_millis(100);
    let provider = provider(&server, ProviderKind::Ollama, "llama3")
        .with_timeout(limit)
        .with_retry_policy(RetryPolicy::none());

    let started = Instant::now();
    let error = provider.chat(&grade_request()).await.unwrap_err();

    assert_eq!(
        error,
        LlmError::Timeout {
            provider: ProviderKind::Ollama,
            timeout: limit,
        }
    );
    assert_eq!(error.to_string(), "ollama request timed out after 0.1s");
    assert!(started.elapsed() < Duration::from_secs(3));
    assert_eq!(server.received().len(), 1);
}

#[tokio::test]
async fn ollama_empty_content_falls_back_to_thinking() {
    let server = MockServer::start([Reply::json(json!({
        "message": { "role": "assistant", "content": "", "thinking": "The score is 7." }
    }))])
    .await;
    let provider = provider(&server, ProviderKind::Ollama, "deepseek-r1");

    assert_eq!(
        provider.chat(&grade_request()).await.unwrap(),
        "The score is 7."
    );
    assert_eq!(server.received().len(), 1);
}

#[tokio::test]
async fn empty_reply_is_an_error() {
    let server = MockServer::start([ollama_reply("")]).await;
    let provider =
        provider(&server, ProviderKind::Ollama, "llama3").with_retry_policy(RetryPolicy::none());

    assert_eq!(
        provider.chat(&grade_request()).await,
        Err(LlmError::EmptyReply(ProviderKind::Ollama))
    );
}

#[tokio::test]
async fn non_json_response_is_an_invalid_response() {
    let server = MockServer::start([Reply::status(200, "<html>gateway</html>")]).await;
    let provider =
        provider(&server, ProviderKind::OpenAi, "gpt-4o").with_retry_policy(RetryPolicy::none());

    assert_eq!(
        provider.chat(&grade_request()).await,
        Err(LlmError::InvalidResponse(
            "openai returned non-JSON response (20 chars): <html>gateway</html>".to_owned()
        ))
    );
}

#[tokio::test]
async fn unreachable_server_is_a_transport_error() {
    // Bind and drop to get a port nothing listens on.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let url = format!("http://{}", listener.local_addr().expect("local address"));
    drop(listener);
    let config = ProviderConfig::new(ProviderKind::Ollama, "llama3").with_base_url(url);
    let provider = provider_for(config).with_retry_policy(RetryPolicy::none());

    let error = provider.chat(&grade_request()).await.unwrap_err();

    assert!(
        matches!(
            error,
            LlmError::Transport {
                provider: ProviderKind::Ollama,
                ..
            }
        ),
        "{error:?}"
    );
}

#[tokio::test]
async fn api_key_never_reaches_errors_or_debug_output() {
    let key = "sk-secret-do-not-print";
    let server = MockServer::start([
        Reply::status(401, &format!("invalid key {key}")),
        Reply::status(200, &format!("not json, but here is your key: {key}")),
    ])
    .await;
    let config = ProviderConfig::new(ProviderKind::OpenAi, "gpt-4o")
        .with_base_url(server.url())
        .with_api_key(key);
    let provider = provider_for(config).with_retry_policy(RetryPolicy::none());

    let unauthorized = provider.chat(&grade_request()).await.unwrap_err();
    let garbled = provider.chat(&grade_request()).await.unwrap_err();

    assert_eq!(unauthorized.status(), Some(401));
    let shown = format!("{unauthorized} {unauthorized:?} {garbled} {garbled:?} {provider:?}");
    assert!(!shown.contains(key), "{shown}");
    assert!(shown.contains("[REDACTED]"));
    // The server did get the real key.
    assert_eq!(
        server.received()[0].header("authorization"),
        Some(format!("Bearer {key}").as_str())
    );
}

#[tokio::test]
async fn list_models_reads_api_tags() {
    let server = MockServer::start([Reply::json(json!({
        "models": [{ "name": "llama3:latest" }, { "name": "qwen3:0.6b" }]
    }))])
    .await;
    let provider = provider(&server, ProviderKind::Ollama, "llama3");

    let models = provider.list_models().await.unwrap();

    assert_eq!(models, ["llama3:latest", "qwen3:0.6b"]);
    let received = server.received();
    assert_eq!(received[0].method, "GET");
    assert_eq!(received[0].path, "/api/tags");
    assert_eq!(received[0].body, "");
}

#[tokio::test]
async fn embed_posts_the_text_and_returns_the_vector() {
    let server = MockServer::start([Reply::json(json!({ "embedding": [0.25, -0.5, 1.0] }))]).await;
    let provider = provider(&server, ProviderKind::Ollama, "nomic-embed-text");

    let embedding = provider.embed("Hello world").await.unwrap();

    assert_eq!(embedding, [0.25, -0.5, 1.0]);
    let received = server.received();
    assert_eq!(received[0].path, "/api/embeddings");
    assert_eq!(
        received[0].json(),
        json!({ "model": "nomic-embed-text", "prompt": "Hello world" })
    );
}

/// A one-request-per-connection HTTP server that answers with canned replies
/// in order and records what it was sent.
mod server {
    use std::collections::VecDeque;
    use std::net::SocketAddr;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use serde_json::Value;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};
    use tokio::task::JoinHandle;

    #[derive(Debug, Clone)]
    pub struct Received {
        pub method: String,
        pub path: String,
        headers: Vec<(String, String)>,
        pub body: String,
    }

    impl Received {
        pub fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .map(|(_, value)| value.as_str())
        }

        pub fn json(&self) -> Value {
            serde_json::from_str(&self.body).expect("request body is JSON")
        }
    }

    #[derive(Debug, Clone)]
    pub struct Reply {
        status: u16,
        body: String,
        delay: Duration,
    }

    impl Reply {
        pub fn json(body: Value) -> Self {
            Self::status(200, &body.to_string())
        }

        pub fn status(status: u16, body: &str) -> Self {
            Self {
                status,
                body: body.to_owned(),
                delay: Duration::ZERO,
            }
        }

        pub fn after(mut self, delay: Duration) -> Self {
            self.delay = delay;
            self
        }
    }

    pub struct MockServer {
        addr: SocketAddr,
        received: Arc<Mutex<Vec<Received>>>,
        task: JoinHandle<()>,
    }

    impl MockServer {
        pub async fn start(replies: impl IntoIterator<Item = Reply>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
            let addr = listener.local_addr().expect("local address");
            let received = Arc::new(Mutex::new(Vec::new()));
            let replies = Arc::new(Mutex::new(replies.into_iter().collect::<VecDeque<_>>()));

            let log = Arc::clone(&received);
            let task = tokio::spawn(async move {
                while let Ok((stream, _)) = listener.accept().await {
                    tokio::spawn(serve(stream, Arc::clone(&log), Arc::clone(&replies)));
                }
            });
            Self {
                addr,
                received,
                task,
            }
        }

        pub fn url(&self) -> String {
            format!("http://{}", self.addr)
        }

        pub fn received(&self) -> Vec<Received> {
            self.received.lock().unwrap().clone()
        }
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    async fn serve(
        mut stream: TcpStream,
        log: Arc<Mutex<Vec<Received>>>,
        replies: Arc<Mutex<VecDeque<Reply>>>,
    ) {
        let Some(request) = read_request(&mut stream).await else {
            return;
        };
        log.lock().unwrap().push(request);
        let reply = replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Reply::status(500, "mock server has no reply left"));

        tokio::time::sleep(reply.delay).await;
        let response = format!(
            "HTTP/1.1 {} Mock\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            reply.status,
            reply.body.len(),
            reply.body
        );
        // The client may have given up already; that is what the timeout test wants.
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
    }

    async fn read_request(stream: &mut TcpStream) -> Option<Received> {
        let mut buffer = Vec::new();
        let head_end = loop {
            if let Some(at) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
                break at + 4;
            }
            read_more(stream, &mut buffer).await?;
        };

        let head = String::from_utf8_lossy(&buffer[..head_end]).into_owned();
        let mut lines = head.lines();
        let mut request_line = lines.next()?.split_whitespace();
        let method = request_line.next()?.to_owned();
        let path = request_line.next()?.to_owned();
        let headers: Vec<(String, String)> = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.trim().to_owned(), value.trim().to_owned()))
            .collect();

        let length = headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .and_then(|(_, value)| value.parse::<usize>().ok())
            .unwrap_or(0);
        while buffer.len() < head_end + length {
            read_more(stream, &mut buffer).await?;
        }

        Some(Received {
            method,
            path,
            headers,
            body: String::from_utf8_lossy(&buffer[head_end..head_end + length]).into_owned(),
        })
    }

    async fn read_more(stream: &mut TcpStream, buffer: &mut Vec<u8>) -> Option<()> {
        let mut chunk = [0; 4096];
        match stream.read(&mut chunk).await {
            Ok(read) if read > 0 => {
                buffer.extend_from_slice(&chunk[..read]);
                Some(())
            }
            _ => None,
        }
    }
}
