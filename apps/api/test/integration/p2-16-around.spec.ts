/**
 * P2-16 — Jump-to-message ?around pagination (FR-MSG-016).
 *
 * Exact ID-sequence assertions against the seeded #volume channel
 * (1000 deterministic messages). IDs are derived at runtime from the
 * API by finding messages via their deterministic content suffix
 * "(msg N)". The #volume channel is discovered by name ("Fixture Guild" /
 * "#volume") rather than from fixture-ids.json, making these oracles
 * portable across database instances.
 *
 * @satisfies FR-MSG-016
 */
import { apiFetch, createJar } from '../characterization/helpers';

// ── Runtime oracle: build msg-number → ID map from the API ──
let msgById: Map<number, string>; // msg number (1..1000) → message ID

async function buildMsgMap(
  jar: ReturnType<typeof createJar>,
  channelId: string,
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let cursor: string | undefined;
  const MSG_RE = /\(msg (\d+)\)/;

  while (map.size < 1000) {
    const url = `/channels/${channelId}/messages?limit=100${cursor ? `&before=${cursor}` : ''}`;
    const res = await apiFetch(url, { jar });
    if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) break;
    for (const m of res.body) {
      const match = MSG_RE.exec(m.content);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!map.has(n)) map.set(n, m.id);
      }
    }
    cursor = res.body[res.body.length - 1]?.id;
  }
  return map;
}

async function devLogin(username: string) {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', {
    method: 'POST',
    body: { username },
    jar,
  });
  expect(res.status).toBe(201);
  return { jar, userId: res.body.id };
}

function apiGet(path: string, jar: any) {
  return apiFetch(path, { jar });
}

describe('P2-16 — ?around pagination (FR-MSG-016)', () => {
  let jar: ReturnType<typeof createJar>;
  let channelId: string;

  beforeAll(async () => {
    const user = await devLogin('alice');
    jar = user.jar;

    // Discover the Fixture Guild server by name
    const serversRes = await apiGet('/servers', jar);
    if (serversRes.status !== 200 || !Array.isArray(serversRes.body)) {
      throw new Error('Failed to list servers');
    }
    const fixtureGuild = serversRes.body.find((s: any) => s.name === 'Fixture Guild');
    if (!fixtureGuild) throw new Error('Fixture Guild server not found');

    // Discover the #volume channel by name within Fixture Guild
    const channelsRes = await apiGet(`/servers/${fixtureGuild.id}/channels`, jar);
    if (channelsRes.status !== 200 || !Array.isArray(channelsRes.body)) {
      throw new Error('Failed to list channels');
    }
    const volumeCh = channelsRes.body.find((c: any) => c.name === '#volume');
    if (!volumeCh) throw new Error('#volume channel not found');
    channelId = volumeCh.id;
    console.log(`[discovery] channelId=${channelId}`);

    msgById = await buildMsgMap(jar, channelId);
  }, 60_000);

  // ── Helper: get the expected ID window from a target msg number ──
  // Returns [newestMsgNum, ..., oldestMsgNum] IDs for the ?around window
  function expectWindow(targetNum: number, limit: number): string[] {
    // newest = targetNum + floor((limit-1)/2), clamped to [1, 1000]
    // but the API pads from whichever side has available messages
    const halfBefore = Math.floor((limit - 1) / 2);
    const halfAfter = limit - 1 - halfBefore;
    let startNum = targetNum - halfBefore;
    let endNum = targetNum + halfAfter;
    // clamp
    if (startNum < 1) { endNum = Math.min(1000, endNum + (1 - startNum)); startNum = 1; }
    if (endNum > 1000) { startNum = Math.max(1, startNum - (endNum - 1000)); endNum = 1000; }
    const ids: string[] = [];
    for (let n = endNum; n >= startNum; n--) {
      const id = msgById.get(n);
      if (!id) throw new Error(`msg ${n} not found in corpus`);
      ids.push(id);
    }
    return ids;
  }

  // @satisfies FR-MSG-016
  it('returns a window around msg 500 with exact IDs (middle of channel)', async () => {
    const targetId = msgById.get(500)!;
    const expected = expectWindow(500, 10);
    const res = await apiFetch(
      `/channels/${channelId}/messages?around=${targetId}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(expected);
    // Verify newest-first order
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns a window around msg 1 (oldest) — pads from newer side', async () => {
    const targetId = msgById.get(1)!;
    const expected = expectWindow(1, 10);
    const res = await apiFetch(
      `/channels/${channelId}/messages?around=${targetId}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(expected);
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns a window around msg 1000 (newest) — pads from older side', async () => {
    const targetId = msgById.get(1000)!;
    const expected = expectWindow(1000, 10);
    const res = await apiFetch(
      `/channels/${channelId}/messages?around=${targetId}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(expected);
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns 404 for a nonexistent message id', async () => {
    const res = await apiFetch(
      `/channels/${channelId}/messages?around=00000000-0000-0000-0000-000000000000&limit=10`,
      { jar },
    );
    expect(res.status).toBe(404);
  });

  // @satisfies FR-MSG-016
  it('respects custom limit', async () => {
    const targetId = msgById.get(500)!;
    const res = await apiFetch(
      `/channels/${channelId}/messages?around=${targetId}&limit=5`,
      { jar },
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
    // Target should be in the results
    const targetIdx = res.body.findIndex((m: any) => m.id === targetId);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < res.body.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('does not break ?before pagination (additive check)', async () => {
    const targetId = msgById.get(500)!;
    const res = await apiFetch(
      `/channels/${channelId}/messages?before=${targetId}&limit=5`,
      { jar },
    );
    expect(res.status).toBe(200);
    for (const m of res.body) {
      expect(m.id).not.toBe(targetId);
    }
    for (let i = 1; i < res.body.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });
});
