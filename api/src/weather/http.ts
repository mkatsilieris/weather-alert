import { config } from '../config.js';

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Worth another try: rate limited (429), a server hiccup (5xx), or the network itself (DNS, reset, timeout). */
const transient = (err: unknown) => (err instanceof HttpError ? err.status === 429 || err.status >= 500 : true);
const RETRY_DELAYS_MS = [2_000, 6_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOnce<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.scan.userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}: ${text}`, res.status);
  }
  return (await res.json()) as T;
}

/** GET a JSON document; transient failures are tried again twice, a few seconds apart. */
export async function fetchJson<T>(url: string, timeoutMs = 25_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce<T>(url, timeoutMs);
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !transient(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
