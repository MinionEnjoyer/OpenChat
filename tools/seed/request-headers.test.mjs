import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSeedRequestHeaders } from './request-headers.mjs';

test('seed mutations use the configured first-party Origin with session cookies', () => {
  assert.deepEqual(prepareSeedRequestHeaders({
    method: 'POST',
    body: { name: 'Fixture Guild' },
    cookie: 'chat.sid=seed-session',
    webOrigin: 'https://chat.seed.test',
  }), {
    cookie: 'chat.sid=seed-session',
    origin: 'https://chat.seed.test',
    'content-type': 'application/json',
  });
});

test('seed rejection probes can retain an explicit Origin', () => {
  assert.deepEqual(prepareSeedRequestHeaders({
    method: 'DELETE',
    headers: { Origin: 'https://untrusted.example' },
    cookie: 'chat.sid=seed-session',
    webOrigin: 'https://chat.seed.test',
  }), {
    Origin: 'https://untrusted.example',
    cookie: 'chat.sid=seed-session',
  });
});

test('seed reads do not send Origin', () => {
  assert.deepEqual(prepareSeedRequestHeaders({
    method: 'GET',
    cookie: 'chat.sid=seed-session',
    webOrigin: 'https://chat.seed.test',
  }), { cookie: 'chat.sid=seed-session' });
});
