/**
 * Generic retry wrapper with exponential backoff for transient AI call failures.
 * Retries on: 429, 500, 502, 503, and network errors (no status code).
 * Does NOT retry on client errors: 400, 401, 403, 404.
 */

/**
 * Configuration options for the retry wrapper.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Callback fired before each retry attempt with attempt number and error */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Wraps an async function with exponential backoff retry logic.
 *
 * Retryable status codes: 429, 500, 502, 503
 * Non-retryable: 400, 401, 403, 404
 *
 * Backoff formula: delay = baseDelay * 3^(attempt-1)
 * Default delays: 1s, 3s, 9s
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Promise resolving to the function result or throwing the last error
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const onRetry = options?.onRetry;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Extract status code from various error formats
      const status =
        (error as { status?: number }).status ??
        (error as { statusCode?: number }).statusCode ??
        (error as { response?: { status?: number } }).response?.status;

      // Check if this is a non-retryable client error
      const isClientError = status && [400, 401, 403, 404].includes(status);

      // If client error or last attempt, throw immediately
      if (isClientError || attempt >= maxRetries) {
        throw lastError;
      }

      // Fire retry callback
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Calculate exponential backoff: baseDelay * 3^attempt
      const delay = baseDelay * Math.pow(3, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but satisfy TypeScript
  throw lastError ?? new Error("Retry exhausted");
}
