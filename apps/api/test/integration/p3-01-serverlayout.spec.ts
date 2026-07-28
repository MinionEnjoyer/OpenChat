/**
 * P3-01 — serverLayout round-trip integration (FR-SRV-001).
 *
 * FR-SRV-001's oracle: layout JSON round-trip equals web format byte-for-byte.
 * Schema derived from apps/web/src/lib/types.ts:11-16 and Apps/web/src/App.tsx:331.
 * Observed live: PUT → GET /auth/me returns byte-identical serverLayout.
 *
 * @satisfies FR-SRV-001
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { put: 'PUT', post: 'POST' } as const;

interface ServerFolder {
  id: string;
  name: string;
  color: number;
  serverIds: string[];
  collapsed?: boolean;
}

interface ServerLayout {
  folders: ServerFolder[];
  order?: string[];
}

describe('P3-01 — serverLayout round-trip (FR-SRV-001)', () => {
  // @satisfies FR-SRV-001
  it('round-trips a serverLayout byte-for-byte through PUT then GET /auth/me', async () => {
    // 1. Dev-login to get a bearer token
    const jar = createJar();
    const login = await apiFetch('/auth/dev-login', {
      method: API.post,
      body: { username: 'p3-01-layout' },
      jar,
    });
    expect(login.status).toBe(201);
    const token = login.body.accessToken as string;

    // 2. Build a layout that exercises all fields
    const layout: ServerLayout = {
      folders: [
        {
          id: 'f-main',
          name: 'Main',
          color: 0x5865f2,
          serverIds: ['server-1', 'server-2'],
        },
        {
          id: 'f-games',
          name: 'Games',
          color: 0x57f287,
          serverIds: ['server-3'],
          collapsed: true,
        },
      ],
      order: ['f:1', 'f:2'],
    };

    // 3. PUT the layout via bearer
    const putRes = await apiFetch('/auth/server-layout', {
      method: API.put,
      headers: { authorization: `Bearer ${token}` },
      body: { layout },
    });
    expect(putRes.status).toBe(200);

    // 4. GET /auth/me and assert byte-identical deep equality
    const me = await apiFetch('/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);

    const stored: ServerLayout = me.body.serverLayout;
    expect(stored).toEqual(layout);
  });
});