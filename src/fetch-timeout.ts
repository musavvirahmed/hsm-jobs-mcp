export type FetchWithTimeoutOptions = {
  timeoutMs?: number;
};

/** Bound for operator shutdown (Playwright / MCP session close). */
export const DEFAULT_RUNTIME_CLOSE_TIMEOUT_MS = 8_000;

/**
 * Resolve `promise` or reject with TimeoutError. Does not cancel the
 * underlying work — callers that own a child process must kill it on timeout
 * or Node will stay alive.
 */
export async function awaitWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), {
              name: "TimeoutError",
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Default politeness bound for operator crawl network calls. */
export const DEFAULT_CRAWL_FETCH_TIMEOUT_MS = 20_000;

/**
 * Wrap fetch with a hard timeout. Even if the underlying fetch ignores
 * AbortSignal, the race rejects so callers cannot hang forever.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CRAWL_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const parentSignal = init?.signal;
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error(`fetch timed out after ${timeoutMs}ms`), { name: "TimeoutError" }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
