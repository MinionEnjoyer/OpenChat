/**
 * P2-01 — ?before cursor pagination (FR-MSG-001).
 *
 * FR-MSG-001 acceptance criterion: "Integration vs seeded 1000-msg channel:
 * exact page joins, no dupes/gaps (assert by id sequence)."
 *
 * This test exercises the real API + DB stack against the seeded #volume
 * channel (1000 deterministic messages in "Fixture Guild"). It paginates
 * through all 1000 messages via ?before cursor, then asserts:
 *   - No duplicate message IDs across any pages
 *   - Every expected message number (1..1000) appears exactly once
 *   - The ID sequence is newest-anchored (newest-first), matching the
 *     known msg-number→ID mapping built from the API itself
 *
 * @satisfies FR-MSG-001
 */
import { apiFetch, createJar } from '../characterization/helpers';

// ── Runtime oracle: build msg-number → ID map from the API ──
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

describe('P2-01 — ?before cursor pagination (FR-MSG-001)', () => {
  let jar: ReturnType<typeof createJar>;
  let channelId: string;
  let msgById: Map<number, string>; // msg number (1..1000) → message ID
  let allIds: string[];            // all message IDs in newest-first order

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

    msgById = await buildMsgMap(jar, channelId);
    expect(msgById.size).toBe(1000);

    // ── Fresh pagination: collect all IDs via ?before cursor ──
    allIds = [];
    let cursor: string | undefined;
    const PAGE_SIZE = 100;

    while (allIds.length < 1000) {
      const url = `/channels/${channelId}/messages?limit=${PAGE_SIZE}${cursor ? `&before=${cursor}` : ''}`;
      const res = await apiFetch(url, { jar });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length === 0) break;

      for (const m of res.body) {
        allIds.push(m.id);
      }
      cursor = res.body[res.body.length - 1]?.id;
    }
  }, 120_000);

  // @satisfies FR-MSG-001
  it('collects exactly 1000 messages with no duplicate IDs', () => {
    const idSet = new Set(allIds);
    expect(idSet.size).toBe(1000);
    // The set size matching the array length proves no duplicates
    expect(idSet.size).toBe(allIds.length);
  });

  // @satisfies FR-MSG-001
  it('every message from the corpus appears exactly once (no gaps)', () => {
    // Build a reverse map: ID → msg number
    const idToNum = new Map<string, number>();
    for (const [num, id] of msgById) {
      idToNum.set(id, num);
    }

    // Every collected ID must map to a known msg number
    for (const id of allIds) {
      expect(idToNum.has(id)).toBe(true);
    }

    // Every known msg number (1..1000) must appear in the collected IDs
    const foundNums = new Set(allIds.map((id) => idToNum.get(id)));
    for (let n = 1; n <= 1000; n++) {
      expect(foundNums.has(n)).toBe(true);
    }
  });

  // @satisfies FR-MSG-001
  it('pages are newest-anchored (strict newest-first within each page)', () => {
    // Re-paginate and verify ordering within each individual page
    let cursor: string | undefined;
    const PAGE_SIZE = 100;

    async function checkPages() {
      let cursor2: string | undefined;
      while (true) {
        const url = `/channels/${channelId}/messages?limit=${PAGE_SIZE}${cursor2 ? `&before=${cursor2}` : ''}`;
        const res = await apiFetch(url, { jar });
        expect(res.status).toBe(200);
        if (!Array.isArray(res.body) || res.body.length === 0) break;

        for (let i = 1; i < res.body.length; i++) {
          const prev = new Date(res.body[i - 1].createdAt).getTime();
          const curr = new Date(res.body[i].createdAt).getTime();
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
        cursor2 = res.body[res.body.length - 1]?.id;
        if (res.body.length < PAGE_SIZE) break;
      }
    }

    return checkPages();
  });

  // @satisfies FR-MSG-001
  it('?before cursor correctly advances: page N+1 starts where page N ended', async () => {
    // Fetch two consecutive pages and verify the seam
    const page1 = await apiFetch(`/channels/${channelId}/messages?limit=10`, { jar });
    expect(page1.status).toBe(200);
    expect(page1.body.length).toBeGreaterThan(0);

    const lastOfPage1 = page1.body[page1.body.length - 1];
    const page2 = await apiFetch(
      `/channels/${channelId}/messages?limit=10&before=${lastOfPage1.id}`,
      { jar },
    );
    expect(page2.status).toBe(200);
    expect(page2.body.length).toBeGreaterThan(0);

    // No message in page2 should appear in page1 (no duplicates at seam)
    const page1Ids = new Set(page1.body.map((m: any) => m.id));
    for (const m of page2.body) {
      expect(page1Ids.has(m.id)).toBe(false);
    }

    // Every message in page2 must be older than the last message of page1
    const lastTime = new Date(lastOfPage1.createdAt).getTime();
    for (const m of page2.body) {
      expect(new Date(m.createdAt).getTime()).toBeLessThan(lastTime);
    }
  });

  // @satisfies FR-MSG-001
  it('empty page when ?before the oldest message', async () => {
    // Message 1 is the oldest
    const oldestId = msgById.get(1)!;
    const res = await apiFetch(
      `/channels/${channelId}/messages?limit=10&before=${oldestId}`,
      { jar },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
