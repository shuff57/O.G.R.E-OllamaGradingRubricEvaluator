/**
 * Generic retry wrapper with exponential backoff for transient AI call failures.
 * Retries on: 429, 500, 502, 503, and network errors (no status code).
 * Does NOT retry on client errors: 400, 401, 403, 404.
 *
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms (exponential: base * 3^attempt)
 * @param {(attempt: number, error: Error) => void} [options.onRetry] - Callback on each retry
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 1000;
  const onRetry = options.onRetry;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.status ?? error.statusCode ?? (error.response?.status);
      const isClientError = status && [400, 401, 403, 404].includes(status);

      if (isClientError || attempt >= maxRetries) {
        throw error;
      }

      if (onRetry) onRetry(attempt + 1, error);
      const delay = baseDelay * Math.pow(3, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
