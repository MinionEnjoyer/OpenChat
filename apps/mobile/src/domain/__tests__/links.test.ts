// @satisfies FR-MSG-015
import { buildMessageLink } from '../links';

describe('buildMessageLink (FR-MSG-015 copy link)', () => {
  // @satisfies FR-MSG-015
  it('produces correct openchat://chat/{channelId}/{messageId} format', () => {
    const link = buildMessageLink('ch-abc-123', 'msg-xyz-456');
    expect(link).toBe('openchat://chat/ch-abc-123/msg-xyz-456');
  });

  // @satisfies FR-MSG-015
  it('handles UUID channel and message ids', () => {
    const link = buildMessageLink(
      'de7bf295-0ccc-4e1b-8580-d386b370eb7a',
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(link).toBe(
      'openchat://chat/de7bf295-0ccc-4e1b-8580-d386b370eb7a/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  // @satisfies FR-MSG-015
  it('is a valid URI with scheme openchat', () => {
    const link = buildMessageLink('ch-1', 'msg-1');
    expect(() => new URL(link)).not.toThrow();
    const parsed = new URL(link);
    expect(parsed.protocol).toBe('openchat:');
  });
});
