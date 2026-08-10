import { prepareApiRequestHeaders } from '../characterization/helpers';

describe('API test harness request boundary', () => {
  it('adds the configured first-party Origin to cookie-authenticated mutations', () => {
    expect(prepareApiRequestHeaders({
      method: 'PATCH',
      body: { status: 'AWAY' },
      cookie: 'chat.sid=harness-session',
      webOrigin: 'https://chat.harness.test',
    })).toEqual({
      cookie: 'chat.sid=harness-session',
      origin: 'https://chat.harness.test',
      'content-type': 'application/json',
    });
  });

  it('preserves an explicitly supplied Origin for rejection-path tests', () => {
    expect(prepareApiRequestHeaders({
      method: 'DELETE',
      headers: { Origin: 'https://untrusted.example' },
      cookie: 'chat.sid=harness-session',
      webOrigin: 'https://chat.harness.test',
    })).toEqual({
      Origin: 'https://untrusted.example',
      cookie: 'chat.sid=harness-session',
    });
  });

  it('does not add Origin to cookie-authenticated reads', () => {
    expect(prepareApiRequestHeaders({
      method: 'GET',
      cookie: 'chat.sid=harness-session',
      webOrigin: 'https://chat.harness.test',
    })).toEqual({ cookie: 'chat.sid=harness-session' });
  });
});
