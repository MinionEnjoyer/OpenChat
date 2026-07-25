/**
 * P2-16 — Jump-to-message ?around pagination (FR-MSG-016).
 *
 * Exact ID-sequence assertions against the seeded #volume channel
 * (1000 deterministic messages). IDs verified live at implementation time
 * and captured here. The characterization suite is the regression net for
 * ?before behaviour; these tests are the oracle for ?around.
 *
 * @satisfies FR-MSG-016
 */
import { apiFetch, createJar } from '../characterization/helpers';

const CHANNEL_ID = '25628aa7-9fd6-4587-8f7e-de465e8f8cee';

// ── IDs captured from the live seeded #volume channel (run 2026-07-25) ──
// Message numbers are embedded in content as "(msg N)".
const IDS = {
  // Middle of channel — around msg 500, limit 10 → msgs 505..496 newest-first
  around500_limit10: [
    'fb9c159d-b437-40da-ac98-515c5c473280', // msg 505
    'b93ee798-a638-4e43-96ea-1838841fb017', // msg 504
    'f3a0f10d-0ef5-4dba-a7d0-007721679ad5', // msg 503
    '46b20154-2b43-45a5-b7bd-26dc78f3cb1e', // msg 502
    'b95bb934-7190-4eb5-8725-3c4c545c8ee6', // msg 501
    '362ed5f7-53ba-4ca0-b2b3-22fe5b35b823', // msg 500 (target)
    '8c332466-cf3d-4abd-87cb-c310b954b284', // msg 499
    '67eb64b5-0f00-4a91-ab36-0e708aa1a1ea', // msg 498
    'dece819b-92e9-44cd-833c-96ea9f813ecd', // msg 497
    'b0d34922-b0c7-4cb1-b370-3f8757653489', // msg 496
  ],
  // Oldest message — around msg 1, limit 10 → msgs 10..1 newest-first
  around1_limit10: [
    '03acb9e8-3e76-49ee-a1e0-b1cafac90672', // msg 10
    '6ef1fc58-758c-464f-9301-e48f54649dae', // msg 9
    'd23cc501-50f4-459e-9cb0-33e32182a450', // msg 8
    '6aefab04-bc9b-460b-b793-cbe8604f0b06', // msg 7
    '23d42668-c8a2-4c2e-b60f-271651982c9b', // msg 6
    '0b240abd-41ad-4f54-bcef-ff82618245a1', // msg 5
    '45b2a9e7-e4dc-4a73-ad8a-171067a63ade', // msg 4
    'f5ca7cfe-226b-473d-aa87-02f454e1e132', // msg 3
    '6e233558-811f-4764-963d-59b86aa1a1a5', // msg 2
    '5db5d890-b172-42ac-a9d0-414ca4250f36', // msg 1 (target)
  ],
  // Newest message — around msg 1000, limit 10 → msgs 1000..991 newest-first
  around1000_limit10: [
    'b8389826-3ba0-4ccf-87a8-ad4da064231f', // msg 1000 (target)
    'dcedfb68-f5da-45cc-b0bf-6e7715b68ee6', // msg 999
    '8efe2c44-88e7-4ead-a80d-c2815cff25c6', // msg 998
    'ff002e16-97a9-4afc-9301-3a8a0159fca4', // msg 997
    '95cc3bce-2c0c-451a-b031-a0c64dd6f198', // msg 996
    '67ed6f8b-d01c-403f-aeee-997f7847529e', // msg 995
    '4e837faf-1361-4c8f-9394-2c73456fcf6b', // msg 994
    '759a7b7a-7a06-4226-8de7-b32807789fbd', // msg 993
    '7e4b8812-1942-4a5f-8604-eaf808458d96', // msg 992
    '1b15e93e-f3ab-40da-9c8e-28785616f429', // msg 991
  ],
} as const;

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

describe('P2-16 — ?around pagination (FR-MSG-016)', () => {
  let jar: ReturnType<typeof createJar>;

  beforeAll(async () => {
    // Use the pre-seeded alice who is the Fixture Guild owner (channel access guaranteed).
    const user = await devLogin('alice');
    jar = user.jar;
  });

  // @satisfies FR-MSG-016
  it('returns a window around msg 500 with exact IDs (middle of channel)', async () => {
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?around=${IDS.around500_limit10[5]}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(IDS.around500_limit10);
    // Verify newest-first order
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns a window around msg 1 (oldest) — pads from newer side', async () => {
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?around=${IDS.around1_limit10[9]}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(IDS.around1_limit10);
    // Verify newest-first order
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns a window around msg 1000 (newest) — pads from older side', async () => {
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?around=${IDS.around1000_limit10[0]}&limit=10`,
      { jar },
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(IDS.around1000_limit10);
    // Verify newest-first order
    for (let i = 1; i < ids.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('returns 404 for a nonexistent message id', async () => {
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?around=00000000-0000-0000-0000-000000000000&limit=10`,
      { jar },
    );
    expect(res.status).toBe(404);
  });

  // @satisfies FR-MSG-016
  it('respects custom limit', async () => {
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?around=${IDS.around500_limit10[5]}&limit=5`,
      { jar },
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
    // Target should be in the middle-ish
    const targetIdx = res.body.findIndex((m: any) => m.id === IDS.around500_limit10[5]);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    // Verify newest-first order
    for (let i = 1; i < res.body.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });

  // @satisfies FR-MSG-016
  it('does not break ?before pagination (additive check)', async () => {
    // ?before should still work exactly as before
    const res = await apiFetch(
      `/channels/${CHANNEL_ID}/messages?before=${IDS.around500_limit10[5]}&limit=5`,
      { jar },
    );
    expect(res.status).toBe(200);
    // All returned messages should have createdAt < target's createdAt
    // since ?before uses lt cursor
    for (const m of res.body) {
      expect(m.id).not.toBe(IDS.around500_limit10[5]);
    }
    // Verify newest-first order
    for (let i = 1; i < res.body.length; i++) {
      expect(new Date(res.body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body[i].createdAt).getTime());
    }
  });
});
