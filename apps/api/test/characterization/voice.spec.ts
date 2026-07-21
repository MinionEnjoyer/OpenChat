/** @characterizes voice — join {url,token,room}, JWT claims (E8) */
import { seed, apiFetch } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('voice — join', () => {
  it('POST /voice/:channelId/join → {url,token,room} (201)', async () => {
    const res = await apiFetch(`/voice/${s.voiceChannelId}/join`, { method:'POST', jar:s.alice.jar });
    // characterizes: voice join returns 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('url');
    expect(res.body.url).toContain('ws://');
    expect(res.body).toHaveProperty('token');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('room', s.voiceChannelId);
  });
  it('token decodes to JWT with claim names per E8', async () => {
    const res = await apiFetch(`/voice/${s.voiceChannelId}/join`, { method:'POST', jar:s.alice.jar });
    const parts = res.body.token.split('.');
    expect(parts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    expect(payload).toHaveProperty('sub', s.alice.userId);
    expect(payload).toHaveProperty('iss', 'devkey');
    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('name');
    expect(payload).toHaveProperty('video');
    expect(payload.video).toHaveProperty('roomJoin', true);
    expect(payload.video).toHaveProperty('room', s.voiceChannelId);
  });
});

describe('voice — participants', () => {
  it('GET returns array', async () => {
    const res = await apiFetch(`/voice/${s.voiceChannelId}/participants`, { jar:s.alice.jar });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('voice — leave', () => {
  it('POST returns {success:true}', async () => {
    const res = await apiFetch(`/voice/${s.voiceChannelId}/leave`, { method:'POST', jar:s.alice.jar });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
  });
});