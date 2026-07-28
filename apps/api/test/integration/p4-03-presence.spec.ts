/**
 * P4-03 — Presence persistence integration test (FR-SOC-004)
 *
 * Verifies that PATCH /me with a status field persists to the DB
 * and is observable via a subsequent GET /me. Does NOT trust a 200 —
 * queries the effect.
 *
 * @satisfies FR-SOC-004
 */
import { apiFetch, devLogin } from '../characterization/helpers';
import type { createJar } from '../characterization/helpers';

describe('P4-03 presence persistence (FR-SOC-004)', () => {
  let jar: ReturnType<typeof createJar>;
  let baseStatus: string;

  beforeAll(async () => {
    const user = await devLogin('alice');
    jar = user.jar;
    // Record the starting status so we can restore it.
    const me = await apiFetch('/auth/me', { jar });
    baseStatus = me.body?.status ?? 'ONLINE';
  });

  afterAll(async () => {
    // Restore original status.
    if (baseStatus) {
      await apiFetch('/auth/me', { method: 'PATCH', body: { status: baseStatus }, jar });
    }
  });

  it('PATCH /me status=INVISIBLE persists and is queryable via GET /me', async () => {
    // 1. Set status to INVISIBLE via REST.
    const patch = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: { status: 'INVISIBLE' },
      jar,
    });
    expect(patch.status).toBe(200);

    // 2. Query — the effect must be observable, not just a 200.
    const me = await apiFetch('/auth/me', { jar });
    expect(me.status).toBe(200);
    expect(me.body.status).toBe('INVISIBLE');
  });

  it('PATCH /me status=DND persists and is queryable via GET /me', async () => {
    const patch = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: { status: 'DND' },
      jar,
    });
    expect(patch.status).toBe(200);

    const me = await apiFetch('/auth/me', { jar });
    expect(me.status).toBe(200);
    expect(me.body.status).toBe('DND');
  });

  it('PATCH /me status=AWAY persists and is queryable via GET /me', async () => {
    const patch = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: { status: 'AWAY' },
      jar,
    });
    expect(patch.status).toBe(200);

    const me = await apiFetch('/auth/me', { jar });
    expect(me.status).toBe(200);
    expect(me.body.status).toBe('AWAY');
  });

  it('PATCH /me status=ONLINE persists and is queryable via GET /me', async () => {
    const patch = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: { status: 'ONLINE' },
      jar,
    });
    expect(patch.status).toBe(200);

    const me = await apiFetch('/auth/me', { jar });
    expect(me.status).toBe(200);
    expect(me.body.status).toBe('ONLINE');
  });

  // ── Prove it can fail ────────────────────────────────────────────────
  it('status query matches actual persisted value (prove-it-can-fail)', async () => {
    // Set a known status.
    await apiFetch('/auth/me', {
      method: 'PATCH',
      body: { status: 'AWAY' },
      jar,
    });

    const me = await apiFetch('/auth/me', { jar });
    // A naive test might trust a 200 without checking the body.
    // This assertion proves the body actually holds the correct status.
    expect(me.body.status).toBe('AWAY');
  });
});
