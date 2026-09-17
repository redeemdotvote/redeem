/**
 * The Robinhood Chain public RPC is explicitly rate limited and "not intended for
 * production-grade, high-throughput" use — we hit 429s while probing it. So every chain read
 * in this app goes through this in-process cache: one inflight request per key, short TTL,
 * and a stale value served (with its age) rather than a failure when the RPC pushes back.
 */
interface Entry<T> {
  value: T;
  storedAt: number;
}

const entries = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface Cached<T> {
  value: T;
  /** Milliseconds since this value was read from chain. */
  ageMs: number;
  /** True when the RPC failed and a previously cached value was served instead. */
  stale: boolean;
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && now - hit.storedAt < ttlMs) {
    return { value: hit.value, ageMs: now - hit.storedAt, stale: false };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    const value = await existing;
    return { value, ageMs: 0, stale: false };
  }

  const promise = load()
    .then((value) => {
      entries.set(key, { value, storedAt: Date.now() });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);

  try {
    const value = await promise;
    return { value, ageMs: 0, stale: false };
  } catch (error) {
    if (hit) {
      return { value: hit.value, ageMs: Date.now() - hit.storedAt, stale: true };
    }
    throw error;
  }
}

export function invalidate(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

export function isRateLimited(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${error.name}` : String(error);
  return /429|too many requests|rate limit/i.test(text);
}

/**
 * The two ways this RPC refuses a log query that asks for too much at once, as opposed to a
 * rate limit: it abandons the query at roughly two seconds ("log query timed out"), and it
 * caps a single response at ten thousand logs. Both mean "ask for a narrower range", where a
 * 429 means "ask again in a moment" — opposite responses, so they are told apart by message.
 */
export function isQueryTooHeavy(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /query timed out|exceeds limit/i.test(text);
}
