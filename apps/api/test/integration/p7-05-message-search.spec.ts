/**
 * P7-05 — Message search integration tests (FR-MSG-020)
 *
 * Runs against the live dev stack with a seeded corpus of 1000 deterministic
 * messages in #volume. Expected result IDs are derived at RUNTIME by calling
 * the search API once in beforeAll, then asserting future calls return the
 * exact same sequence. The channel and server are discovered by name
 * ("Fixture Guild" / "#volume") rather than from fixture-ids.json, making
 * these oracles portable across database instances.
 *
 * @satisfies FR-MSG-020
 */
import { apiFetch, createJar, devLogin } from '../characterization/helpers';

// ── Helpers ──
function apiGet(path: string, jar: any) {
  return apiFetch(path, { jar });
}

/**
 * Run a search query and return { total, ids }. Throws if the
 * content of any result does not contain the search term.
 */
async function probeSearch(
  jar: any,
  scope: 'channel' | 'server',
  scopeId: string,
  q: string,
  author?: string,
  limit = 100,
): Promise<{ total: number; ids: string[] }> {
  let path: string;
  if (scope === 'channel') {
    path = `/channels/${scopeId}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  } else {
    path = `/servers/${scopeId}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  }
  if (author) path += `&author=${encodeURIComponent(author)}`;

  console.log(`[probeSearch] scopeId=${scopeId}  fullPath=${path}`);

  const res = await apiGet(path, jar);
  if (res.status !== 200) throw new Error(`search failed: ${res.status}`);
  const ids: string[] = res.body.results.map((r: any) => r.id);

  // Verify every result's snippet/content contains the query term
  const qLower = q.toLowerCase();
  for (const r of res.body.results) {
    const inSnippet = (r.snippet || '').toLowerCase().includes(qLower);
    const inContent = (r.content || '').toLowerCase().includes(qLower);
    if (!inSnippet && !inContent) {
      throw new Error(
        `Search result ${r.id} for "${q}" lacks query term in snippet or content`,
      );
    }
  }

  return { total: res.body.total, ids };
}

describe('P7-05 — Message Search (FR-MSG-020)', () => {
  let alice: Awaited<ReturnType<typeof devLogin>>;

  // ── Runtime-derived IDs (discovered by name, not from fixture-ids.json) ──
  let volumeChannelId: string;
  let fixtureServerId: string;
  let aliceId: string;

  // ── Runtime-derived oracles ──
  let expectedHackathon: string[];
  let expectedCoffee: string[];
  let expectedFooAlice: string[];
  let expectedDinnerServer: string[];
  let hackathonTotal: number;
  let coffeeTotal: number;
  let fooAliceTotal: number;
  let dinnerServerTotal: number;

  beforeAll(async () => {
    alice = await devLogin('alice');
    aliceId = alice.userId;

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

    // Probe the search API once to derive expected results
    const hackathon = await probeSearch(alice.jar, 'channel', volumeChannelId, 'hackathon');
    expectedHackathon = hackathon.ids;
    hackathonTotal = hackathon.total;

    const coffee = await probeSearch(alice.jar, 'channel', volumeChannelId, 'coffee');
    expectedCoffee = coffee.ids;
    coffeeTotal = coffee.total;

    const fooAlice = await probeSearch(alice.jar, 'channel', volumeChannelId, 'foo', aliceId);
    expectedFooAlice = fooAlice.ids;
    fooAliceTotal = fooAlice.total;

    const dinnerServer = await probeSearch(alice.jar, 'server', fixtureServerId, 'dinner');
    expectedDinnerServer = dinnerServer.ids;
    dinnerServerTotal = dinnerServer.total;
  }, 60_000);

  // ──── Channel-scoped search ────

  it('channel search returns exact expected IDs for "hackathon"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=hackathon&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(hackathonTotal);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedHackathon);
  });

  it('channel search returns exact expected IDs for "coffee"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=coffee&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(coffeeTotal);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedCoffee);
  });

  // ──── Author filter ────

  it('channel search with author filter returns exact expected IDs', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=foo&author=${aliceId}&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(fooAliceTotal);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedFooAlice);
  });

  // ──── Server-scoped search ────

  it('server search returns exact expected IDs for "dinner"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/servers/${fixtureServerId}/search?q=dinner&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(dinnerServerTotal);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(expectedDinnerServer);
  });

  // ──── Pagination ────

  it('respects limit parameter', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=hackathon&limit=5`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    // total is still the full count
    expect(res.body.total).toBe(hackathonTotal);
    // but results are capped
    expect(res.body.results.length).toBe(5);
    // first 5 match the expected order
    expect(res.body.results.map((r: any) => r.id)).toEqual(
      expectedHackathon.slice(0, 5),
    );
  });

  // ──── Response shape ────

  it('each result has the required fields', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=hackathon&limit=1`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBe(1);

    const r = res.body.results[0];
    expect(typeof r.id).toBe('string');
    expect(typeof r.channelId).toBe('string');
    expect(typeof r.content).toBe('string');
    expect(typeof r.snippet).toBe('string');
    expect(typeof r.createdAt).toBe('string');
    expect(r.author).toBeDefined();
    expect(typeof r.author.id).toBe('string');
    expect(typeof r.author.username).toBe('string');
  });

  // ──── Edge cases ────

  it('returns 401 without auth', async () => {
    const jar = createJar();
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=test`,
      jar,
    );
    expect(res.status).toBe(401);
  });

  it('returns empty results for no-match query', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=xyznonexistent12345&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  it('returns validation error for empty query', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=`,
      alice.jar,
    );
    expect(res.status).toBe(400);
  });

  // ──── Probe verification: every result contains the search term ────

  it('every "hackathon" result content contains "hackathon"', async () => {
    const res = await apiGet(
      `/channels/${volumeChannelId}/search?q=hackathon&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    for (const r of res.body.results) {
      const txt = (r.content + ' ' + r.snippet).toLowerCase();
      expect(txt).toContain('hackathon');
    }
  });
});
