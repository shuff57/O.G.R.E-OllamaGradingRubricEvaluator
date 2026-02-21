import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry } from "./ai-retry";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create an Error with a `.status` property, mimicking HTTP error responses. */
function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

/** Create an Error with a `.statusCode` property (alternative format). */
function httpErrorAlt(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

/** Create an Error with a nested `.response.status` property. */
function httpErrorNested(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { response: { status: number } }).response = { status };
  return err;
}

/** Near-instant retries to keep tests fast without fake timers. */
const FAST = { baseDelay: 1 };

// ── withRetry ───────────────────────────────────────────────────────────

describe("withRetry", () => {

  // ── Success path ────────────────────────────────────────────────────

  it("returns the value on first-call success", async () => {
    const fn = vi.fn().mockResolvedValue("hello");

    const result = await withRetry(fn);

    expect(result).toBe("hello");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the value when succeeding after retries", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(httpError("rate limit", 429))
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, FAST);

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── Retryable HTTP statuses ─────────────────────────────────────────

  describe("retries on transient HTTP errors", () => {
    for (const status of [429, 500, 502, 503]) {
      it(`retries on HTTP ${status}`, async () => {
        const fn = vi.fn()
          .mockRejectedValueOnce(httpError(`HTTP ${status}`, status))
          .mockResolvedValue("ok");

        const result = await withRetry(fn, FAST);

        expect(result).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
      });
    }
  });

  // ── Non-retryable HTTP statuses ─────────────────────────────────────

  describe("does NOT retry on client errors", () => {
    for (const status of [400, 401, 403, 404]) {
      it(`throws immediately on HTTP ${status}`, async () => {
        const fn = vi.fn().mockRejectedValue(httpError(`HTTP ${status}`, status));

        await expect(withRetry(fn)).rejects.toThrow(`HTTP ${status}`);
        expect(fn).toHaveBeenCalledTimes(1);
      });
    }
  });

  // ── Alternative error formats ───────────────────────────────────────

  it("detects status from .statusCode property", async () => {
    const fn = vi.fn().mockRejectedValue(httpErrorAlt("bad request", 400));

    await expect(withRetry(fn)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("detects status from .response.status property", async () => {
    const fn = vi.fn().mockRejectedValue(httpErrorNested("forbidden", 403));

    await expect(withRetry(fn)).rejects.toThrow("forbidden");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries .statusCode 429", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(httpErrorAlt("rate limited", 429))
      .mockResolvedValue("done");

    expect(await withRetry(fn, FAST)).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries .response.status 502", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(httpErrorNested("bad gateway", 502))
      .mockResolvedValue("done");

    expect(await withRetry(fn, FAST)).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── Non-HTTP errors (no status) are retried ─────────────────────────

  it("retries errors without a status property (network errors)", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue("success");

    expect(await withRetry(fn, FAST)).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries non-Error thrown values", async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      if (callCount++ === 0) throw "string error";
      return "ok";
    });

    expect(await withRetry(fn, FAST)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── maxRetries ──────────────────────────────────────────────────────

  it("uses default maxRetries of 3 (4 total attempts)", async () => {
    const fn = vi.fn().mockImplementation(async () => { throw new Error("always fails"); });

    await expect(withRetry(fn, FAST)).rejects.toThrow("always fails");
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("respects custom maxRetries = 1", async () => {
    const fn = vi.fn().mockImplementation(async () => { throw new Error("fails"); });

    await expect(withRetry(fn, { ...FAST, maxRetries: 1 })).rejects.toThrow("fails");
    // 1 initial + 1 retry = 2 total
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects custom maxRetries = 0 (no retries)", async () => {
    const fn = vi.fn().mockImplementation(async () => { throw new Error("fails"); });

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow("fails");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects custom maxRetries = 5", async () => {
    const fn = vi.fn().mockImplementation(async () => { throw new Error("fails"); });

    await expect(withRetry(fn, { ...FAST, maxRetries: 5 })).rejects.toThrow("fails");
    // 1 initial + 5 retries = 6 total
    expect(fn).toHaveBeenCalledTimes(6);
  });

  // ── Exhaustion re-throws last error ─────────────────────────────────

  it("throws the last error after exhausting retries", async () => {
    let callCount = 0;
    const errors = ["error 1", "error 2", "error 3", "error 4 (last)"];
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error(errors[callCount++] ?? "unexpected");
    });

    await expect(withRetry(fn, { ...FAST, maxRetries: 3 })).rejects.toThrow("error 4 (last)");
  });

  it("wraps non-Error thrown values into Error on exhaustion", async () => {
    const fn1 = vi.fn().mockImplementation(async () => { throw "plain string"; });
    await expect(withRetry(fn1, { maxRetries: 0 })).rejects.toThrow("plain string");

    const fn2 = vi.fn().mockImplementation(async () => { throw 42; });
    await expect(withRetry(fn2, { maxRetries: 0 })).rejects.toThrow("42");
  });

  // ── Exponential backoff ─────────────────────────────────────────────

  it("uses default baseDelay of 1000ms with formula baseDelay * 3^attempt", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;

    // Intercept setTimeout to capture delay values, execute near-instantly
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (typeof delay === "number" && delay >= 1000) {
          delays.push(delay);
        }
        return realSetTimeout(callback, 0, ...args);
      }) as typeof setTimeout,
    );

    const fn = vi.fn().mockImplementation(async () => {
      throw httpError("err", 500);
    });

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow();

    // Expected: 1000*3^0=1000, 1000*3^1=3000, 1000*3^2=9000
    expect(delays).toEqual([1000, 3000, 9000]);

    setTimeoutSpy.mockRestore();
  });

  it("uses custom baseDelay", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (typeof delay === "number" && delay >= 100) {
          delays.push(delay);
        }
        return realSetTimeout(callback, 0, ...args);
      }) as typeof setTimeout,
    );

    const fn = vi.fn().mockImplementation(async () => {
      throw httpError("err", 500);
    });

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 500 })).rejects.toThrow();

    // Expected: 500*3^0=500, 500*3^1=1500
    expect(delays).toEqual([500, 1500]);

    setTimeoutSpy.mockRestore();
  });

  // ── onRetry callback ────────────────────────────────────────────────

  it("calls onRetry with correct (attempt, error) arguments", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(httpError("err1", 500))
      .mockRejectedValueOnce(httpError("err2", 502))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { ...FAST, onRetry });

    expect(result).toBe("ok");

    expect(onRetry).toHaveBeenCalledTimes(2);
    // First retry: attempt = 1
    expect(onRetry.mock.calls[0][0]).toBe(1);
    expect(onRetry.mock.calls[0][1]).toBeInstanceOf(Error);
    expect(onRetry.mock.calls[0][1].message).toBe("err1");
    // Second retry: attempt = 2
    expect(onRetry.mock.calls[1][0]).toBe(2);
    expect(onRetry.mock.calls[1][1].message).toBe("err2");
  });

  it("does NOT call onRetry when fn succeeds on first try", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockResolvedValue("ok");

    await withRetry(fn, { onRetry });

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does NOT call onRetry when a client error occurs", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValue(httpError("bad", 400));

    await expect(withRetry(fn, { onRetry })).rejects.toThrow("bad");
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does NOT call onRetry on the final failed attempt", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockImplementation(async () => { throw new Error("fail"); });

    await expect(withRetry(fn, { ...FAST, maxRetries: 2, onRetry })).rejects.toThrow("fail");
    // 2 retries → onRetry called 2 times (not 3)
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1);
    expect(onRetry.mock.calls[1][0]).toBe(2);
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it("works with no options (all defaults)", async () => {
    const fn = vi.fn().mockResolvedValue(42);

    expect(await withRetry(fn)).toBe(42);
  });

  it("handles fn returning undefined", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    expect(await withRetry(fn)).toBeUndefined();
  });

  it("handles fn returning null", async () => {
    const fn = vi.fn().mockResolvedValue(null);

    expect(await withRetry(fn)).toBeNull();
  });

  it("handles fn returning complex objects", async () => {
    const obj = { score: 8, feedback: "Good work" };
    const fn = vi.fn().mockResolvedValue(obj);

    expect(await withRetry(fn)).toBe(obj);
  });

  it("succeeds on the very last attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(httpError("err", 500))
      .mockRejectedValueOnce(httpError("err", 500))
      .mockRejectedValueOnce(httpError("err", 500))
      .mockResolvedValue("last-chance");

    expect(await withRetry(fn, { ...FAST, maxRetries: 3 })).toBe("last-chance");
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
