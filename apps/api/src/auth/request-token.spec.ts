import { requestToken } from './request-token';

describe('requestToken', () => {
  it('accepts bearer credentials on any guarded route', () => {
    expect(requestToken({ headers: { authorization: 'Bearer abc' }, path: '/servers' })).toBe('abc');
  });

  it('accepts query credentials only on media routes', () => {
    expect(requestToken({ query: { token: 'abc' }, path: '/media/id/raw' })).toBe('abc');
    expect(requestToken({ query: { token: 'abc' }, originalUrl: '/api/v1/media/id/raw?token=abc' })).toBe('abc');
    expect(requestToken({ query: { token: 'abc' }, path: '/watchparty/stream/item-id' })).toBe('abc');
    expect(requestToken({ query: { token: 'abc' }, path: '/watchparty/image/item-id' })).toBe('abc');
    expect(requestToken({ query: { token: 'abc' }, path: '/servers' })).toBe('');
    expect(requestToken({ query: { token: 'abc' }, path: '/watchparty/library' })).toBe('');
  });
});
