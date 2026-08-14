import type { Page, Route } from '@playwright/test';

const createdAt = '2026-08-08T18:00:00.000Z';

export const users = {
  me: { id: 'alex', username: 'alex', displayName: 'Alex', avatarUrl: null, friendCode: 'ALEX-1234', status: 'ONLINE' },
  morgan: { id: 'morgan', username: 'morgan', displayName: 'Morgan', avatarUrl: null, status: 'ONLINE' },
};

export const servers = [
  { id: 'server-1', name: 'OpenChat Community', ownerId: 'alex', iconUrl: null, createdAt, updatedAt: createdAt, myPermissions: '2047' },
  { id: 'server-2', name: 'Development Lab', ownerId: 'morgan', iconUrl: null, createdAt, updatedAt: createdAt, myPermissions: '1536' },
];

export const channels = {
  'server-1': [
    { id: 'general', serverId: 'server-1', categoryId: null, name: 'general', type: 'TEXT', topic: null, position: 0, parentId: null, isDefault: true },
    { id: 'development', serverId: 'server-1', categoryId: null, name: 'development', type: 'TEXT', topic: null, position: 1, parentId: null, isDefault: false },
    { id: 'lounge', serverId: 'server-1', categoryId: null, name: 'Lounge', type: 'VOICE', topic: null, position: 2, parentId: null, isDefault: false },
  ],
  'server-2': [
    { id: 'lab-general', serverId: 'server-2', categoryId: null, name: 'general', type: 'TEXT', topic: null, position: 0, parentId: null, isDefault: true },
  ],
};

function message(channelId: string, index: number, content?: string) {
  return {
    id: `${channelId}-${index}`,
    channelId,
    authorId: index % 2 ? users.morgan.id : users.me.id,
    author: index % 2 ? users.morgan : users.me,
    content: content ?? `Message ${index} in ${channelId}. This deterministic browser fixture has enough copy to exercise scrolling.`,
    createdAt: `2026-08-08T18:${String(index % 60).padStart(2, '0')}:00.000Z`,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    replyTo: null,
    pinned: index === 4,
    kind: 'USER',
    attachments: [],
    reactions: [],
  };
}

export const messagesByChannel: Record<string, ReturnType<typeof message>[]> = {
  general: Array.from({ length: 60 }, (_, index) => message('general', index + 1)).map((item, index, all) => (
    index === all.length - 3
      ? { ...item, content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
      : item
  )),
  development: Array.from({ length: 45 }, (_, index) => message('development', index + 1)),
  'lab-general': Array.from({ length: 12 }, (_, index) => message('lab-general', index + 1)),
  'dm-1': [message('dm-1', 1, 'Private message fixture')],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function messagesForRequest(url: URL) {
  const match = url.pathname.match(/^\/api\/channels\/([^/]+)\/messages$/);
  const channelId = match?.[1] ?? '';
  const source = messagesByChannel[channelId] ?? [];
  const around = url.searchParams.get('around');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');
  let page = source;
  if (around) {
    const index = source.findIndex((item) => item.id === around);
    page = index < 0 ? [] : source.slice(Math.max(0, index - 24), index + 26);
  } else if (before) {
    const index = source.findIndex((item) => item.id === before);
    page = index <= 0 ? [] : source.slice(Math.max(0, index - 50), index);
  } else if (after) {
    const index = source.findIndex((item) => item.id === after);
    page = index < 0 ? [] : source.slice(index + 1, index + 51);
  } else {
    page = source.slice(-50);
  }
  // The API returns newest first; useMessageHistory normalizes it for rendering.
  return page.slice().reverse();
}

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();

  if (path === '/api/auth/me') return json(route, users.me);
  if (path === '/api/config') return json(route, { shareBaseUrl: 'https://share.example.test', jellyfinUrl: '' });
  if (path === '/api/servers' && method === 'GET') return json(route, servers);
  if (path === '/api/dms' && method === 'GET') return json(route, [{ id: 'dm-1', type: 'DM', recipients: [users.me, users.morgan], lastMessageAt: createdAt }]);
  if (path === '/api/friends') return json(route, [users.morgan]);
  if (path === '/api/friends/requests') return json(route, { incoming: [], outgoing: [] });
  if (path === '/api/auth/ws-ticket') return json(route, { ticket: 'browser-harness', expiresAt: '2099-01-01T00:00:00.000Z' });
  if (path === '/api/notifications') return json(route, {
    friendRequests: [{ id: 'friend-request-1', user: users.morgan }],
    serverInvites: [{ id: 'invite-1', createdAt, server: { id: 'server-3', name: 'Creator Hub', iconUrl: null }, inviter: users.morgan }],
    count: 2,
  });
  if (path === '/api/notifications/settings') return json(route, []);

  const channelList = path.match(/^\/api\/servers\/([^/]+)\/channels$/);
  if (channelList && method === 'GET') return json(route, channels[channelList[1] as keyof typeof channels] ?? []);
  const memberList = path.match(/^\/api\/servers\/([^/]+)\/members$/);
  if (memberList && method === 'GET') return json(route, [
    { userId: users.me.id, nickname: null, joinedAt: createdAt, isOwner: true, roleIds: [], user: users.me },
    { userId: users.morgan.id, nickname: null, joinedAt: createdAt, isOwner: false, roleIds: [], user: users.morgan },
  ]);

  if (/^\/api\/channels\/[^/]+\/messages$/.test(path) && method === 'GET') return json(route, messagesForRequest(url));
  const read = path.match(/^\/api\/channels\/([^/]+)\/read$/);
  if (read && method === 'GET') {
    const items = messagesByChannel[read[1]] ?? [];
    return json(route, { lastReadMessageId: null, latestMessageId: items.at(-1)?.id ?? null });
  }
  if (read && method === 'POST') return json(route, { success: true, lastReadMessageId: JSON.parse(request.postData() || '{}').lastReadMessageId });
  if (/^\/api\/channels\/[^/]+\/messages\/search$/.test(path)) {
    return json(route, [message(path.split('/')[3], 100, 'Morgan wrote the searchable release note')]);
  }
  if (/^\/api\/channels\/[^/]+\/pins$/.test(path)) return json(route, [message(path.split('/')[3], 4, 'Pinned browser fixture')]);
  if (/^\/api\/watchparty\/[^/]+$/.test(path) && method === 'GET') return json(route, null);
  if (/^\/api\/watchparty\/[^/]+\/(leave|close|stop)$/.test(path) && method === 'POST') return json(route, { success: true }, 201);
  if (/^\/api\/voice\/[^/]+\/participants$/.test(path)) return json(route, []);
  if (/^\/api\/servers\/[^/]+\/stickers$/.test(path) && method === 'GET') {
    return json(route, [{ id: 'sticker-1', name: 'Wave', url: '/api/media/sticker-1/raw' }]);
  }
  if (path === '/api/gifs/search') return json(route, [{ id: 'gif-1', url: 'https://media.giphy.com/media/example/giphy.gif', previewUrl: '/logo.png', width: 200, height: 120 }]);
  if (path === '/api/uploads' && method === 'POST') return json(route, {
    attachments: [{ id: 'attachment-1', shareAssetId: 'asset-1', filename: 'browser-proof.txt', mimeType: 'text/plain', size: '13', url: '/api/media/asset-1/raw', thumbnailUrl: null, width: null, height: null, durationMs: null }],
    rejected: [],
  });
  if (path === '/api/server-invitations/invite-1/accept' && method === 'POST') {
    return json(route, { ...servers[0], id: 'server-3', name: 'Creator Hub' });
  }
  if (path === '/api/friends/requests/friend-request-1/accept' && method === 'POST') return json(route, undefined, 204);

  return json(route, {});
}

export async function installOpenChatHarness(page: Page) {
  await page.addInitScript(() => {
    class HarnessWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 0;
      url: string;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(url: string | URL) {
        this.url = String(url);
        const target = window as typeof window & {
          __openChatHarnessDispatchWs?: (payload: unknown) => void;
        };
        target.__openChatHarnessDispatchWs = (payload) => {
          this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
        };
        setTimeout(() => {
          this.readyState = HarnessWebSocket.OPEN;
          this.onopen?.(new Event('open'));
        });
      }
      send(data: string) {
        const target = window as typeof window & { __openChatHarnessWsMessages?: string[] };
        target.__openChatHarnessWsMessages ??= [];
        target.__openChatHarnessWsMessages.push(data);
      }
      close() {
        this.readyState = HarnessWebSocket.CLOSED;
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    Object.defineProperty(window, 'WebSocket', { value: HarnessWebSocket, configurable: true });
  });
  await page.route('**/api/**', handleApi);
}
