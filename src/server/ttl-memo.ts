import 'server-only';

/**
 * A very short in-memory cache for read-only aggregate queries, used only on Cloudflare Workers.
 *
 * Why this exists: on Workers every query is a fresh TLS connection to Postgres, because a socket
 * cannot be carried from one request to the next. The analytics dashboard runs ~20 aggregate queries
 * per render, so one page view means ~20 connections. A burst of views exhausted the isolate and the
 * Worker started answering 503 / "exceeded resource limits" even though each individual query was
 * fast. These numbers only change when somebody imports a file or edits a case, so holding them for
 * a few seconds per isolate removes almost all of that work.
 *
 * Deliberately in-isolate rather than the Next cache API: it needs no platform cache binding, it
 * cannot leak between deployments, and it never applies in dev or tests (callers only use it when
 * `runningOnWorkers`), so a developer's edits are always read fresh from the database.
 *
 * A failed query is never cached, and `invalidateTtl()` is called after a write that must be visible
 * straight away (the WhatsApp importer).
 */

const TTL_MS = 60_000;
const store = new Map<string, { at: number; value: unknown }>();

/** Drops everything. Called after a write so the next render shows it. */
export function invalidateTtl(): void {
  store.clear();
}

/**
 * Returns the cached value for `key` when it is younger than the TTL, otherwise runs `fn` and caches
 * a successful result. Rejected promises propagate and leave nothing cached.
 */
export async function ttlMemo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  const value = await fn();
  // Keep the map from growing without bound if a caller ever passes unbounded keys.
  if (store.size > 50) store.clear();
  store.set(key, { at: Date.now(), value });
  return value;
}