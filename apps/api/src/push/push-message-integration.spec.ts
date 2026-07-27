/**
 * @satisfies FR-NOTIF-001
 * @satisfies FR-NOTIF-003
 *
 * Integration tests: MessagesService.create() → PushDispatchService → MockPushTransport.
 * Services are manually wired to avoid NestJS DI complexity — we test the business
 * chain, not the DI container.
 *
 * One test per push case: DM, server-channel message, and @mention.
 *
 * Perturb-and-restore: temporarily remove the dispatch call, confirm test FAILS,
 * restore, confirm it PASSES. A test that passes with the feature removed proves nothing.
 */
import { MessagesService } from '../messages/messages.service';
import { PushDispatchService } from './push-dispatch.service';
import { MockPushTransport } from './mock-push.transport';

// ── Helpers ────────────────────────────────────────────────────
const NOW = new Date('2026-07-26T00:00:00Z');

function makePrismaMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'msg-1',
    channelId: overrides.channelId ?? 'ch-1',
    authorId: overrides.authorId ?? 'author-1',
    content: overrides.content ?? 'hello world',
    createdAt: NOW,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    pinned: false,
    author: {
      id: overrides.authorId ?? 'author-1',
      username: 'author',
      displayName: (overrides.authorName as string) ?? 'Author Name',
      avatarUrl: null,
      status: 'ONLINE',
    },
    attachments: [],
    reactions: [],
    replyTo: null,
    poll: null,
  };
}

interface MockPrismaConfig {
  channelServerId?: string | null;
  channelName?: string;
  authorId?: string;
  dmRecipients?: string[];
  serverMembers?: string[];
  deviceTokens?: string[];
  /** Per-member detail for @mention resolution (serverMember.findMany returns these) */
  memberDetails?: Array<{ userId: string; user: { username: string; displayName: string; status: string }; roles: Array<{ id: string; name: string; permissions: bigint }> }>;
}

function buildMockPrisma(cfg: MockPrismaConfig = {}) {
  const channelServerId = cfg.channelServerId ?? null;
  const channelName = cfg.channelName ?? 'general';
  const authorId = cfg.authorId ?? 'author-1';
  const tokens: string[] = cfg.deviceTokens ?? [];

  // findUnique returns { serverId } for channel lookups, but dispatchMentions
  // also looks up channel with name. We keep the result consistent.
  const channelLookup = jest.fn().mockImplementation((args: { where?: { id?: string }; select?: unknown }) => {
    if (args.where?.id === 'ch-1') {
      const result: Record<string, unknown> = {};
      if (!args.select || (args.select as Record<string, boolean>).serverId) result.serverId = channelServerId;
      if (!args.select || (args.select as Record<string, boolean>).name) result.name = channelName;
      return Promise.resolve(result);
    }
    return Promise.resolve(null);
  });

  const messageCreate = jest.fn().mockResolvedValue(
    makePrismaMessage({ channelId: 'ch-1', authorId, authorName: 'Author Name', content: 'hello' }),
  );

  const serverMemberFindUnique = jest.fn().mockResolvedValue(
    channelServerId ? { serverId: channelServerId, userId: authorId } : null,
  );

  const dmMemberFindMany = jest.fn().mockResolvedValue(
    (cfg.dmRecipients ?? [authorId, 'recip-1']).map((uid) => ({
      userId: uid,
      user: { username: uid, displayName: `User ${uid}` },
    })),
  );

  const srvMemberFindManyResolved =
    cfg.memberDetails ??
    (cfg.serverMembers ?? [authorId, 'member-2']).map((uid) => ({
      userId: uid,
      user: { username: uid === authorId ? 'author' : uid, displayName: uid === authorId ? 'Author Name' : `User ${uid}`, status: 'ONLINE' as const },
      roles: [] as Array<{ id: string; name: string; permissions: bigint }>,
    }));

  const serverMemberFindMany = jest.fn().mockResolvedValue(srvMemberFindManyResolved);

  const channelRecipientFindUnique = jest.fn().mockResolvedValue(
    channelServerId === null ? { channelId: 'ch-1', userId: authorId } : null,
  );

  const channelRecipientFindMany = jest.fn().mockResolvedValue(
    (cfg.dmRecipients ?? [authorId, 'recip-1']).map((uid) => ({
      userId: uid,
      user: { username: uid, displayName: `User ${uid}` },
    })),
  );

  const notificationSettingFindUnique = jest.fn().mockResolvedValue(null);

  const deviceTokenFindMany = jest.fn().mockResolvedValue(
    tokens.map((t) => ({ token: t })),
  );
  const deviceTokenUpdateMany = jest.fn().mockResolvedValue({ count: tokens.length });
  const deviceTokenDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

  const roleFindMany = jest.fn().mockResolvedValue([]);
  const serverFindUnique = jest.fn().mockResolvedValue({ ownerId: authorId, id: channelServerId });

  const tx = { message: { create: messageCreate } };

  const mockPrisma = {
    message: {
      create: messageCreate,
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    channel: {
      findUnique: channelLookup,
      findMany: jest.fn(),
    },
    serverMember: {
      findUnique: serverMemberFindUnique,
      findMany: serverMemberFindMany,
    },
    channelRecipient: {
      findUnique: channelRecipientFindUnique,
      findMany: channelRecipientFindMany,
    },
    notificationSetting: {
      findUnique: notificationSettingFindUnique,
    },
    deviceToken: {
      findMany: deviceTokenFindMany,
      updateMany: deviceTokenUpdateMany,
      deleteMany: deviceTokenDeleteMany,
    },
    role: {
      findMany: roleFindMany,
    },
    server: {
      findUnique: serverFindUnique,
    },
    $transaction: jest.fn().mockImplementation(async (cb: Function) => cb(tx)),
  };
  return mockPrisma;
}

function buildMockRedis() {
  return {
    getSubscriber: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    }),
    publish: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({ publish: jest.fn().mockResolvedValue(undefined) }),
    setEx: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  };
}

// ── Tests ──────────────────────────────────────────────────────
describe('Push dispatch integration — MessagesService → PushDispatchService', () => {
  let svc: MessagesService;
  let transport: MockPushTransport;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let redis: ReturnType<typeof buildMockRedis>;

  const mkSvc = (
    cfg: MockPrismaConfig = {},
    serversOverride?: Partial<ReturnType<typeof makeServers>>,
  ) => {
    transport = new MockPushTransport();
    transport.reset();
    prisma = buildMockPrisma(cfg);
    redis = buildMockRedis();

    const pushDispatch = new PushDispatchService(redis as any, prisma as any, transport as any);
    // Skip onModuleInit — no real Redis subscriber

    const servers = Object.assign(makeServers(cfg.authorId ?? 'author-1'), serversOverride);
    const auditLog = { write: jest.fn().mockResolvedValue(undefined) };

    svc = new MessagesService(prisma as any, redis as any, auditLog as any, servers as any, pushDispatch);
    (svc as any).logger = { error: jest.fn() }; // suppress real logger noise
    return { pushDispatch, servers };
  };

  function makeServers(authorId: string) {
    return {
      assertNotTimedOut: jest.fn().mockResolvedValue(undefined),
      getChannelPermissions: jest.fn().mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
        BigInt(0xFFFFFFFFFFFFFFFEn), // all perms (not quite all-1s to avoid exact ADMINISTRATOR)
      ),
    };
  }

  // ── Case 1: DM received ──────────────────────────────────────
  describe('Case 1 — DM received (recipient not author)', () => {
    it('pushes NOTIFY to DM recipient when a message is created', async () => {
      mkSvc({
        channelServerId: null,
        channelName: 'DM with Recip',
        authorId: 'author-1',
        dmRecipients: ['author-1', 'recip-1'],
        deviceTokens: ['tok-recip-1'],
      });

      await svc.create('ch-1', 'author-1', { content: 'hey from DM' });
      // Let fire-and-forget dispatchNotify settle
      await new Promise((r) => setTimeout(r, 100));

      expect(transport.sends.length).toBe(1);
      const s = transport.sends[0];
      expect(s.tokens).toContain('tok-recip-1');
      expect(s.payload.data?.type).toBe('notify');
      expect(s.payload.data?.channelId).toBe('ch-1');
      expect(s.payload.title).toContain('Author Name');
    });
  });

  // ── Case 2: Server channel message ───────────────────────────
  describe('Case 2 — Server channel message', () => {
    it('pushes NOTIFY to all non-author server members', async () => {
      mkSvc({
        channelServerId: 'srv-1',
        channelName: 'general',
        authorId: 'author-1',
        serverMembers: ['author-1', 'member-2', 'member-3'],
        deviceTokens: ['tok-m2', 'tok-m3'],
      });

      await svc.create('ch-1', 'author-1', { content: 'hello server' });
      // Let fire-and-forget dispatchNotify settle
      await new Promise((r) => setTimeout(r, 100));

      // member-2 and member-3 should each get a push
      expect(transport.sends.length).toBe(2);
      const allTokens = transport.sends.flatMap((s) => s.tokens);
      expect(allTokens).toContain('tok-m2');
      expect(allTokens).toContain('tok-m3');
      // Author token should NOT be included
      for (const s of transport.sends) {
        expect(s.tokens).not.toContain('tok-author');
        expect(s.payload.data?.type).toBe('notify');
        expect(s.payload.title).toContain('Author Name');
      }
    });
  });

  // ── Case 3: @mention ─────────────────────────────────────────
  describe('Case 3 — @mention in a server channel', () => {
    it('pushes MENTION to the mentioned user', async () => {
      mkSvc({
        channelServerId: 'srv-1',
        channelName: 'general',
        authorId: 'author-1',
        serverMembers: ['author-1', 'member-2', 'member-3'],
        deviceTokens: ['tok-m2', 'tok-m3'],
        memberDetails: [
          { userId: 'author-1', user: { username: 'author', displayName: 'Author Name', status: 'ONLINE' }, roles: [] },
          { userId: 'member-2', user: { username: 'member2', displayName: 'Member Two', status: 'ONLINE' }, roles: [] },
          { userId: 'member-3', user: { username: 'member3', displayName: 'Member Three', status: 'ONLINE' }, roles: [] },
        ],
      });

      await svc.create('ch-1', 'author-1', { content: 'hey @member2 check this' });
      // Let fire-and-forget dispatchMentions settle
      await new Promise((r) => setTimeout(r, 100));

      // dispatchMentions fires → publishes MENTION to Redis AND calls handleEvent directly
      // The direct handleEvent call produces a MENTION push via transport
      const mentionSends = transport.sends.filter((s) => s.payload.data?.type === 'mention');
      expect(mentionSends.length).toBe(1);
      expect(mentionSends[0].tokens).toContain('tok-m2');
      expect(mentionSends[0].payload.title).toContain('mentioned you');
    });
  });
});

// ── Perturb-and-restore proof ──────────────────────────────────
//
// To prove these tests are not vacuous, temporarily remove the dispatch calls:
//
//   1. In messages.service.ts, comment out the `this.dispatchNotify(...)` line in create().
//      Cases 1 and 2 FAIL — transport.sends is empty.
//
//   2. In dispatchMentions, comment out the `await this.pushDispatch.handleEvent(...)` call.
//      Case 3 FAILS — no MENTION send via transport.
//
// Restore the lines and all tests PASS again.
//
// Run:  npx jest -- src/push/push-message-integration.spec.ts
