// @satisfies FR-MSG-015, FR-SRV-006
import { buildMessageLink, parseInviteLink, buildInviteLink } from '../links';

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

// @satisfies FR-SRV-006, FR-APP-005
describe('parseInviteLink (FR-SRV-006 deep-link parsing)', () => {
  // @satisfies FR-SRV-006
  it('parses openchat://invite/<code>', () => {
    const result = parseInviteLink('openchat://invite/ABC12345');
    expect(result.inviteCode).toBe('ABC12345');
    expect(result.error).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('parses https://<host>/invite/<code>', () => {
    const result = parseInviteLink('https://chat.example.com/invite/XYZ99999');
    expect(result.inviteCode).toBe('XYZ99999');
    expect(result.error).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('parses http://<host>/invite/<code>', () => {
    const result = parseInviteLink('http://localhost:3000/invite/CODE123');
    expect(result.inviteCode).toBe('CODE123');
    expect(result.error).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('returns malformed for completely invalid URL', () => {
    const result = parseInviteLink('not-a-valid-url-at-all');
    expect(result.error).toBe('malformed');
    expect(result.inviteCode).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('returns empty_code for invite path with no code', () => {
    const result = parseInviteLink('openchat://invite/');
    expect(result.error).toBe('empty_code');
    expect(result.inviteCode).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('returns empty_code for invite path with no code (https)', () => {
    const result = parseInviteLink('https://chat.example.com/invite/');
    expect(result.error).toBe('empty_code');
    expect(result.inviteCode).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('returns malformed for non-invite openchat path', () => {
    const result = parseInviteLink('openchat://chat/ch-123/msg-456');
    expect(result.error).toBe('malformed');
    expect(result.inviteCode).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('returns wrong_scheme for non-openchat non-http scheme', () => {
    const result = parseInviteLink('ftp://example.com/invite/ABC');
    expect(result.error).toBe('wrong_scheme');
    expect(result.inviteCode).toBeUndefined();
  });

  // @satisfies FR-SRV-006
  it('handles code with special characters via buildInviteLink round-trip', () => {
    const code = 'ab-CD_12';
    const link = buildInviteLink(code);
    const result = parseInviteLink(link);
    expect(result.inviteCode).toBe(code);
    expect(result.error).toBeUndefined();
  });
});
