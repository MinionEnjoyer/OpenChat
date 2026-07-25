/**
 * P7-05 — Message search integration tests (FR-MSG-020)
 *
 * Runs against the live dev stack with a seeded corpus of 1000 deterministic
 * messages in #volume. Expected result IDs were pre-computed from the database
 * using the same PostgreSQL FTS query the service executes, so assertions are
 * EXACT — not counts-greater-than-zero.
 *
 * // @satisfies FR-MSG-020
 */
import { apiFetch, createJar, devLogin } from '../characterization/helpers';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Pre-computed expected ID sets ──
// Generated from the seeded DB via:
//   SELECT m.id FROM "Message" m WHERE ... ORDER BY ts_rank(...) DESC, m."createdAt" DESC

const EXPECTED_HACKATHON = readFileSync(
  resolve(__dirname, '../../../../artifacts/trace/expected-hackathon.txt'),
  'utf-8',
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const EXPECTED_COFFEE = readFileSync(
  resolve(__dirname, '../../../../artifacts/trace/expected-coffee.txt'),
  'utf-8',
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const EXPECTED_FOO_ALICE = readFileSync(
  resolve(__dirname, '../../../../artifacts/trace/expected-foo-alice.txt'),
  'utf-8',
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const EXPECTED_DINNER_SERVER = readFileSync(
  resolve(__dirname, '../../../../artifacts/trace/expected-dinner-server.txt'),
  'utf-8',
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

// ── Fixture IDs ──
const FIXTURES = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tools/seed/fixture-ids.json'), 'utf-8'),
);
const VOLUME_CHANNEL = FIXTURES.volumeChannelId;
const FIXTURE_SERVER = FIXTURES.server.fixtureGuild;
const ALICE_ID = FIXTURES.users.alice;

// ── Helpers ──
function apiGet(path: string, jar: any) {
  return apiFetch(path, { jar });
}

describe('P7-05 — Message Search (FR-MSG-020)', () => {
  let alice: Awaited<ReturnType<typeof devLogin>>;

  beforeAll(async () => {
    alice = await devLogin('alice');
  });

  // ──── Channel-scoped search ────

  it('channel search returns exact expected IDs for "hackathon"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=hackathon&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(EXPECTED_HACKATHON.length);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(EXPECTED_HACKATHON);
  });

  it('channel search returns exact expected IDs for "coffee"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=coffee&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(EXPECTED_COFFEE.length);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(EXPECTED_COFFEE);
  });

  // ──── Author filter ────

  it('channel search with author filter returns exact expected IDs', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=foo&author=${ALICE_ID}&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(EXPECTED_FOO_ALICE.length);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(EXPECTED_FOO_ALICE);
  });

  // ──── Server-scoped search ────

  it('server search returns exact expected IDs for "dinner"', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/servers/${FIXTURE_SERVER}/search?q=dinner&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(EXPECTED_DINNER_SERVER.length);
    const returnedIds: string[] = res.body.results.map((r: any) => r.id);
    expect(returnedIds).toEqual(EXPECTED_DINNER_SERVER);
  });

  // ──── Pagination ────

  it('respects limit parameter', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=hackathon&limit=5`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    // total is still the full count
    expect(res.body.total).toBe(EXPECTED_HACKATHON.length);
    // but results are capped
    expect(res.body.results.length).toBe(5);
    // first 5 match the expected order
    expect(res.body.results.map((r: any) => r.id)).toEqual(
      EXPECTED_HACKATHON.slice(0, 5),
    );
  });

  // ──── Response shape ────

  it('each result has the required fields', async () => {
    // @satisfies FR-MSG-020
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=hackathon&limit=1`,
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
      `/channels/${VOLUME_CHANNEL}/search?q=test`,
      jar,
    );
    expect(res.status).toBe(401);
  });

  it('returns empty results for no-match query', async () => {
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=xyznonexistent12345&limit=100`,
      alice.jar,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  it('returns validation error for empty query', async () => {
    const res = await apiGet(
      `/channels/${VOLUME_CHANNEL}/search?q=`,
      alice.jar,
    );
    expect(res.status).toBe(400);
  });
});
