/**
 * Integration test: POST /api/uploads with a real bearer token against
 * the shared dev stack. Proves the upload broker exists, accepts multipart,
 * and returns web-compatible UploadedAttachment refs.
 *
 * Uses Node's native http module to bypass jest-expo's fetch mock.
 *
 * @satisfies FR-MED-010, FR-MED-002
 */
import { MAX_ATTACHMENTS } from '../types';
import type { UploadedAttachment } from '../types';
import http from 'node:http';

/** Dev stack base. */
const BASE_URL = new URL('http://localhost:3030/api');

interface HttpResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function httpRequest(opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: BASE_URL.hostname,
        port: BASE_URL.port,
        path: opts.path,
        method: opts.method,
        headers: {
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch { /* text response */ }
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) headers[k] = Array.isArray(v) ? v[0]! : v;
          }
          resolve({ status: res.statusCode ?? 0, body, headers });
        });
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** Obtain a bearer token from the shared dev-login endpoint. */
async function getToken(username: string): Promise<string> {
  const res = await httpRequest({
    method: 'POST',
    path: '/api/auth/dev-login',
    body: JSON.stringify({ username }),
  });
  if (res.status !== 201) throw new Error(`dev-login failed: ${res.status}`);
  const body = res.body as { accessToken: string };
  return body.accessToken;
}

describe('POST /api/uploads (integration)', () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken('alice');
  }, 15000);

  it('returns 401 without auth', async () => {
    const res = await httpRequest({
      method: 'POST',
      path: '/api/uploads',
    });
    expect(res.status).toBe(401);
  });

  it('accepts a multipart PNG file and returns UploadedAttachment ref', async () => {
    // Build a multipart body manually
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const filename = 'test.png';
    // Minimal valid PNG (1×1 red pixel, 67 bytes)
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const pngBytes = Buffer.from(pngBase64, 'base64');

    const parts: Buffer[] = [];
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${filename}"\r\n`));
    parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
    parts.push(pngBytes);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const res = await httpRequest({
      method: 'POST',
      path: '/api/uploads',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    expect(res.status).toBe(201);
    const attachments = res.body as UploadedAttachment[];
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments.length).toBe(1);

    const a = attachments[0]!;
    expect(typeof a.shareAssetId).toBe('string');
    expect(a.shareAssetId.length).toBeGreaterThan(0);
    expect(a.filename).toBe(filename);
    expect(a.mimeType).toBe('image/png');
    expect(typeof a.size).toBe('number');
    expect(a.size).toBeGreaterThan(0);
    expect(a.url).toContain('/media/');
    expect(a).toHaveProperty('thumbnailUrl');
    expect(a).toHaveProperty('width');
    expect(a).toHaveProperty('height');
    expect(a).toHaveProperty('durationMs');
  });

  it('rejects POST with no files', async () => {
    const boundary = '----FormBoundaryEmpty';
    const body = Buffer.from(`--${boundary}--\r\n`);
    const res = await httpRequest({
      method: 'POST',
      path: '/api/uploads',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(res.status).toBe(400);
  });

  it('supports up to MAX_ATTACHMENTS (10) files', async () => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    // Minimal PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const pngBytes = Buffer.from(pngBase64, 'base64');

    const parts: Buffer[] = [];
    for (let i = 0; i < MAX_ATTACHMENTS; i++) {
      parts.push(Buffer.from(`--${boundary}\r\n`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="test-${i}.png"\r\n`));
      parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
      parts.push(pngBytes);
      parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const res = await httpRequest({
      method: 'POST',
      path: '/api/uploads',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    expect(res.status).toBe(201);
    const attachments = res.body as UploadedAttachment[];
    expect(attachments.length).toBe(MAX_ATTACHMENTS);
  });
});
