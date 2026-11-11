use std::time::Duration;

/// Retry with exponential backoff: the wait before retry `n` (counting from
/// zero) is `base_delay * 3^n`, so 1s, 3s, 9s with the defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    /// Attempts after the first one.
    pub max_retries: u32,
    pub base_delay: Duration,
}

impl RetryPolicy {
    /// A single attempt.
    pub const fn none() -> Self {
        Self {
            max_retries: 0,
            base_delay: Duration::ZERO,
        }
    }

    /// How long to wait after failed attempt number `attempt`, counting from zero.
    pub fn delay_for(&self, attempt: u32) -> Duration {
        self.base_delay.saturating_mul(3u32.saturating_pow(attempt))
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_millis(1000),
        }
    }
}

/// Runs `op` until it succeeds, fails with an error that is not
/// [retryable](crate::LlmError::is_retryable), or runs out of retries.
/// `on_retry` is told the number of the retry about to happen (from 1) and
/// the error that caused it.
#[cfg(feature = "http")]
pub async fn with_retry<T, Fut>(
    policy: RetryPolicy,
    mut op: impl FnMut() -> Fut,
    mut on_retry: impl FnMut(u32, &crate::LlmError),
) -> crate::Result<T>
where
    Fut: Future<Output = crate::Result<T>>,
{
    let mut attempt = 0;
    loop {
        match op().await {
            Ok(value) => return Ok(value),
            Err(error) if !error.is_retryable() || attempt >= policy.max_retries => {
                return Err(error);
            }
            Err(error) => {
                on_retry(attempt + 1, &error);
                tokio::time::sleep(policy.delay_for(attempt)).await;
                attempt += 1;
            }
        }
    }
}
