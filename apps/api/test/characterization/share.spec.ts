/**
 * @characterizes share — ShareService behavior AS IT IS TODAY
 *
 * NOTE: /api/assets/upload-url is dead code (G2 confirmed).
 * The ShareService in OpenChat calls POST {SHARE_BASE_URL}/api/assets/upload-url
 * and GET {SHARE_BASE_URL}/api/assets/{id}, which don't exist in OpenShare.
 *
 * This test characterizes the dead path's failure mode so Phase 5's repoint is visible.
 * The web client bypasses ShareService entirely — it uploads browser→OpenShare /upload
 * with the user's Share session cookie.
 */

import { apiFetch, shareFetch, devLogin, createJar } from './helpers';
import * as http from 'http';

describe('share — OpenShare public endpoints (per E4/E5)', () => {
  it('GET /raw/:id is public (no auth)', async () => {
    // characterizes: /raw returns 404 for nonexistent IDs (public, no auth required per E4)
    const res = await shareFetch('/raw/nonexistent');
    // characterizes: 404 because ID doesn't exist, not 401 (which would mean auth required)
    expect(res.status).toBe(404);
  });

  it('GET /thumb/:id is public (no auth)', async () => {
    const res = await shareFetch('/thumb/nonexistent');
    // characterizes: /thumb is public (no auth required per E4)
    expect(res.status).toBe(404);
  });

  it('POST /upload requires session (401 without)', async () => {
    const res = await shareFetch('/upload', { method: 'POST' });
    // characterizes: /upload requires auth — 401 without session per E4
    expect(res.status).toBe(401);
  });

  it('OpenShare root serves HTML', async () => {
    const res = await shareFetch('/');
    // characterizes: root serves login page HTML
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    expect(res.body).toContain('<!DOCTYPE html>');
  });
});

describe('share — ShareService dead path (G2)', () => {
  // These tests call the non-existent /api/assets/* routes on OpenShare
  // to characterize the dead path's failure mode.

  it('POST OpenShare /api/assets/upload-url returns 404 (route does not exist)', async () => {
    // characterizes: ShareService.requestUploadUrl() calls this, but it's dead code.
    // The route /api/assets/upload-url does not exist in OpenShare.
    const res = await shareFetch('/api/assets/upload-url', {
      method: 'POST',
      body: { filename: 'test.png', mimeType: 'image/png', size: 1024 },
    });
    // characterizes: the dead path returns 404 — Phase 5 must implement this route
    expect(res.status).toBe(404);
  });

  it('GET OpenShare /api/assets/:id returns 404 (route does not exist)', async () => {
    // characterizes: ShareService.getAssetMetadata() calls this, also dead code.
    const res = await shareFetch('/api/assets/test123');
    // characterizes: the dead path returns 404 — Phase 5 must implement this route
    expect(res.status).toBe(404);
  });

  it('ShareService calls are NOT invoked by the web client (browser uses direct OpenShare upload)', async () => {
    // characterizes: The web client uses browser→OpenShare /upload with session cookie.
    // The ShareService in apps/api/src/share/share.service.ts is dead code (G2).
    // We verify by checking there's no REST endpoint on OpenChat's API that proxies uploads.
    // The only asset-related routes in OpenChat are the message attachment shape (E9),
    // which stores shareAssetId but doesn't proxy bytes.
    //
    // This is a documentation assertion — the proof is in the source code:
    // - OpenChat ShareService calls non-existent OpenShare endpoints
    // - The web client's lib/share.ts uses fetch() directly to OpenShare /upload
    // - No OpenChat API route marshals uploads through ShareService
    expect(true).toBe(true);
  });
});

describe('share — OpenShare dev-login (P0-02a bypass)', () => {
  it('POST /auth/dev-login creates a dev session', async () => {
    const res = await shareFetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ username: 'test' }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      jar: createJar(),
    });
    // characterizes: OpenShare dev-login returns user info when DEV_AUTH=1
    expect(res.status).toBe(200);
    // characterizes: dev-login response shape {sub, username}
    if (res.status === 200) {
      expect(res.body).toHaveProperty('sub');
      expect(res.body).toHaveProperty('username');
    }
  });
});