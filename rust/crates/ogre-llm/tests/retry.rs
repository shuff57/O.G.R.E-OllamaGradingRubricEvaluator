//! Follows `grading-server/test/retry.test.js` case by case.
#![cfg(feature = "http")]

use std::cell::{Cell, RefCell};
use std::time::Duration;

use ogre_llm::{LlmError, ProviderKind, RetryPolicy, with_retry};

fn fast(max_retries: u32) -> RetryPolicy {
    RetryPolicy {
        max_retries,
        base_delay: Duration::from_millis(10),
    }
}

fn status(status: u16, body: &str) -> LlmError {
    LlmError::Http {
        provider: ProviderKind::OpenAi,
        status,
        body: body.to_owned(),
    }
}

/// Runs an operation that fails with each of `failures` in turn and then
/// succeeds. Returns the outcome, the number of calls, and what `on_retry` saw.
async fn run(
    policy: RetryPolicy,
    failures: Vec<LlmError>,
) -> (Result<&'static str, LlmError>, usize, Vec<(u32, LlmError)>) {
    let calls = Cell::new(0);
    let retries = RefCell::new(Vec::new());
    let result = with_retry(
        policy,
        || {
            let failure = failures.get(calls.get()).cloned();
            calls.set(calls.get() + 1);
            async move { failure.map_or(Ok("success"), Err) }
        },
        |attempt, error| retries.borrow_mut().push((attempt, error.clone())),
    )
    .await;
    (result, calls.get(), retries.into_inner())
}

#[tokio::test]
async fn returns_result_on_first_successful_call() {
    let (result, calls, _) = run(fast(3), vec![]).await;
    assert_eq!(result, Ok("success"));
    assert_eq!(calls, 1);
}

#[tokio::test]
async fn retries_on_503_then_returns_result_on_success() {
    let (result, calls, _) = run(fast(3), vec![status(503, "Service Unavailable")]).await;
    assert_eq!(result, Ok("success"));
    assert_eq!(calls, 2);
}

#[tokio::test]
async fn fails_immediately_on_401_without_retrying() {
    let failures = vec![status(401, "Unauthorized"); 5];
    let (result, calls, _) = run(fast(3), failures).await;
    assert_eq!(result, Err(status(401, "Unauthorized")));
    assert_eq!(calls, 1);
}

#[tokio::test]
async fn fails_immediately_on_400_without_retrying() {
    let failures = vec![status(400, "Bad Request"); 5];
    let (result, calls, _) = run(fast(3), failures).await;
    assert_eq!(result, Err(status(400, "Bad Request")));
    assert_eq!(calls, 1);
}

#[tokio::test]
async fn returns_last_error_after_exhausting_all_retries() {
    let failures = vec![status(500, "Internal Server Error"); 5];
    let (result, calls, _) = run(fast(2), failures).await;
    assert_eq!(result, Err(status(500, "Internal Server Error")));
    // 1 initial + 2 retries
    assert_eq!(calls, 3);
}

#[tokio::test]
async fn calls_on_retry_with_correct_attempt_number() {
    let bad_gateway = status(502, "Bad Gateway");
    let (result, _, retries) = run(fast(3), vec![bad_gateway.clone(); 2]).await;
    assert_eq!(result, Ok("success"));
    assert_eq!(retries, [(1, bad_gateway.clone()), (2, bad_gateway)]);
}

#[tokio::test]
async fn retries_on_network_errors() {
    let network = LlmError::Transport {
        provider: ProviderKind::Ollama,
        message: "fetch failed".to_owned(),
    };
    let (result, calls, _) = run(fast(3), vec![network]).await;
    assert_eq!(result, Ok("success"));
    assert_eq!(calls, 2);
}

#[tokio::test]
async fn uses_default_max_retries_of_3() {
    let policy = RetryPolicy {
        base_delay: Duration::from_millis(10),
        ..RetryPolicy::default()
    };
    let (result, calls, _) = run(policy, vec![status(500, "server error"); 10]).await;
    assert!(result.is_err());
    // 1 initial + 3 retries
    assert_eq!(calls, 4);
}

#[test]
fn default_policy_waits_one_three_then_nine_seconds() {
    let policy = RetryPolicy::default();
    assert_eq!(policy.max_retries, 3);
    let delays: Vec<u64> = (0..3)
        .map(|n| policy.delay_for(n).as_millis() as u64)
        .collect();
    assert_eq!(delays, [1000, 3000, 9000]);
}

#[test]
fn only_the_four_client_errors_are_final() {
    for code in [400, 401, 403, 404] {
        assert!(!status(code, "").is_retryable(), "{code}");
    }
    for code in [408, 429, 500, 502, 503] {
        assert!(status(code, "").is_retryable(), "{code}");
    }
}
