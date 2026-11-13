import 'server-only';
import { AwsClient } from 'aws4fetch';

/**
 * Case photos live in a private Neon object-storage bucket (S3-compatible). aws4fetch signs plain fetch()
 * requests, so this runs unchanged in Node and on Cloudflare Workers. The bucket is never public: photos
 * are served only through /api/attachments/[id], which checks who is asking.
 */
interface StorageConfig {
  client: AwsClient;
  endpoint: string;
  bucket: string;
  prefix: string;
}

export class StorageError extends Error {}

let cached: StorageConfig | null | undefined;

function config(): StorageConfig | null {
  if (cached !== undefined) return cached;
  const env = process.env;
  const endpoint = env.STORAGE_ENDPOINT?.trim().replace(/\/+$/, '');
  const bucket = env.STORAGE_BUCKET?.trim();
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return (cached = null);
  cached = {
    client: new AwsClient({ accessKeyId, secretAccessKey, region: env.STORAGE_REGION?.trim() || 'auto', service: 's3' }),
    endpoint,
    bucket,
    prefix: env.STORAGE_PREFIX?.trim() ?? '',
  };
  return cached;
}

export const storageConfigured = () => config() !== null;
/** Prepended to new object keys (the browser tests use "e2e/"). */
export const storagePrefix = () => config()?.prefix ?? '';

function configured() {
  const c = config();
  if (!c) throw new StorageError('Photo storage is not configured (STORAGE_* settings)');
  return c;
}

const objectUrl = (c: StorageConfig, key: string) =>
  `${c.endpoint}/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

export async function putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  const c = configured();
  const res = await c.client.fetch(objectUrl(c, key), {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
  });
  if (!res.ok) throw new StorageError(`Upload of ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** The object as a fetch Response, or null when it does not exist. */
export async function getObject(key: string): Promise<Response | null> {
  const c = configured();
  const res = await c.client.fetch(objectUrl(c, key));
  if (res.status === 404) return null;
  if (!res.ok) throw new StorageError(`Download of ${key} failed: ${res.status}`);
  return res;
}

/** Best effort: used to clean up after a failed save, so it never throws. */
export async function deleteObjects(keys: string[]) {
  const c = config();
  if (!c) return;
  await Promise.all(
    keys.map((key) =>
      c.client.fetch(objectUrl(c, key), { method: 'DELETE' }).then(
        (r) => r.ok || r.status === 404 || console.warn(`Could not delete ${key}: ${r.status}`),
        (e) => console.warn(`Could not delete ${key}:`, e),
      ),
    ),
  );
}
