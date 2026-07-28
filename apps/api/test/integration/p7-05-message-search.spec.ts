/**
 * P7-05 — Message search integration tests (FR-MSG-020)
 *
 * Runs against the live dev stack with a seeded corpus of 1000 deterministic
 * messages in #volume. Expected result IDs are derived INDEPENDENTLY: all
 * messages are fetched via the plain pagination endpoint (NOT the search
 * endpoint), then filtered and sorted locally. Search is asserted to return
 * exactly the independently-computed sequence, so a genuine search bug
 * (wrong ordering, missing results, wrong total) fails the test.
 *
 * @satisfies FR-MSG-020
 */
import { apiFetch, createJar, devLogin } from '../characterization/helpers';

// ── Helpers ──

function apiGet(path: string, jar: any) {
  return apiFetch(path, { jar });
}

/**
 * Fetch ALL messages from a channel via plain pagination (NOT search).
 * Returns newest-first (as the API does).
 */
async function fetchAllChannelMessages(
  jar: any,
  channelId: string,
): Promise<Array<{ id: string; content: string; authorId: string; createdAt: string }>> {
  const all: Array<{ id: string; content: string; authorId: string; createdAt: string }> = [];
  let cursor: string | undefined;

  while (true) {
    const url = `/channels/${channelId}/messages?limit=100${cursor ? `&before=${cursor}` : ''}`;
    const res = await apiGet(url, jar);
    if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) break;

    for (const m of res.body) {
      all.push({
        id: m.id,
        content: m.content,
        authorId: m.authorId,
        createdAt: m.createdAt,
      });
    }

    cursor = res.body[res.body.length - 1]?.id;
    if (res.body.length < 100) break; // last page
  }

  return all;
}

/**
 * Build an independent oracle for a search query:
 * 1. Fetch all messages via plain pagination
 * 2. Filter by content substring (case-insensitive)
 * 3. Sort by createdAt DESC (newest first — matches search ordering when
 *    ts_rank is uniform, which it is for simple single-word queries)
 * 4. Return { total, ids }
 */
async function buildOracle(
  allMessages: Array<{ id: string; content: string; authorId: string; createdAt: string }>,
  q: string,
): Promise<{ total: number; ids: string[] }> {
  const qLower = q.toLowerCase();

  const filtered = allMessages.filter((m) =>
    m.content.toLowerCase().includes(qLower),
  );

  // Sort newest-first — matches the API's `ORDER BY ... m."createdAt" DESC`
  // when all matches have equal ts_rank (true for simple single-word queries).
  filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    total: filtered.length,
    ids: filtered.map((m) => m.id),
  };
}

describe('P7-05 — Message Search (FR-MSG-020)', () => {
  let alice: Awaited<ReturnType<typeof devLogin>>;

  // ── Runtime-derived IDs (discovered by name, not from fixture-ids.json) ──
  let volumeChannelId: string;
  let fixtureServerId: string;

  // ── Full message corpus from #volume (fetched once) ──
  let allVolumeMessages: Array<{ id: string; content: string; authorId: string; createdAt: string }>;

  // ── Independent oracles (computed locally from the full message list) ──
  let expectedHackathon: string[];
  let expectedCoffee: string[];

  beforeAll(async () => {
    alice = await devLogin('alice');

    // Discover the Fixture Guild server by name
    const serversRes = await apiGet('/servers', alice.jar);
    if (serversRes.status !== 200 || !Array.isArray(serversRes.body)) {
      throw new Error('Failed to list servers');
    }
    const fixtureGuild = serversRes.body.find((s: any) => s.name === 'Fixture Guild');
    if (!fixtureGuild) throw new Error('Fixture Guild server not found');
    fixtureServerId = fixtureGuild.id;
    console.log(`[discovery] fixtureServerId=${fixtureServerId}`);

    // Discover the #volume channel by name within Fixture Guild
    const channelsRes = await apiGet(`/servers/${fixtureServerId}/channels`, alice.jar);
    if (channelsRes.status !== 200 || !Array.isArray(channelsRes.body)) {
      throw new Error('Failed to list channels');
    }
    const volumeCh = channelsRes.body.find((c: any) => c.name === '#volume');
    if (!volumeCh) throw new Error('#volume channel not found');
    volumeChannelId = volumeCh.id;
    console.log(`[discovery] volumeChannelId=${volumeChannelId}`);

    // ── INDEPENDENT ORACLE: fetch ALL messages via plain pagination ──
    allVolumeMessages = await fetchAllChannelMessages(alice.jar, volumeChannelId);
    console.log(`[oracle] fetched ${allVolumeMessages.length} messages from #volume`);

    // Build oracles for each query by filtering + sorting locally
    const hackathon = await buildOracle(allVolumeMessages, 'hackathon');
    expectedHackathon = hackathon.ids;
    console.log(`[oracle] hackathon: total=${hackathon.total}, ids=${hackathon.ids.length}`);

    const coffee = await buildOracle(allVolumeMessages, 'coffee');
    expectedCoffee = coffee.ids;
    console.log(`[oracle] coffee: total=${coffee.total}, ids=${coffee.ids.length}`);
  }, 60_000);

  // ──── Channel-scoped search ────

  it('channel search returns exact expected IDs for "hackathon"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=hackathon&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const returnedIds: string[] = res.body.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedHackathon.slice(0, 100));
  });

  it('channel search returns exact expected IDs for "coffee"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=coffee&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const returnedIds: string[] = res.body.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedCoffee.slice(0, 100));
  });

  // ──── Pagination ────

  it('respects limit parameter', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=hackathon&limit=5`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(5);
    expect(res.body.map((r: any) => r.id)).toEqual(
      expectedHackathon.slice(0, 5),
    );
  });

  // ──── Response shape ────

  it('each result has the required fields', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=hackathon&limit=1`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const r = res.body[0];
    expect(typeof r.id).toBe('string');
    expect(typeof r.channelId).toBe('string');
    expect(typeof r.content).toBe('string');
    expect(typeof r.createdAt).toBe('string');
    expect(r.author).toBeDefined();
    expect(typeof r.author.id).toBe('string');
    expect(typeof r.author.username).toBe('string');
  });

  // ──── Edge cases ────

  it('returns 401 without auth', async () => {
    const jar = createJar();
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=test`,
      jar,
    );
    expect(res.status).toBe(401);
  });

  it('returns empty results for no-match query', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=xyznonexistent12345&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('returns validation error for empty query', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=`,
      alice.jar,
    );
    expect(res.status).toBe(400);
  });

  // ──── Independent content verification ────

  it('every "hackathon" result content contains "hackathon"', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/messages/search?q=hackathon&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    for (const r of res.body) {
      const txt = r.content.toLowerCase();
      expect(txt).toContain('hackathon');
    }
  });
});
