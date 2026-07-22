#!/usr/bin/env node
const API = 'http://localhost:3001/api';
let cookies = [];

async function api(path, opts = {}) {
  const headers = {};
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (!headers['content-type'] && opts.method !== 'GET' && opts.body)
    headers['content-type'] = 'application/json';
  const res = await fetch(API + path, { ...opts, headers, redirect: 'manual' });
  const sc = res.headers.get('set-cookie');
  if (sc) cookies.push(sc.split(';')[0]);
  let body;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

async function main() {
  const a = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'diag-alice' }) });
  console.log('alice login:', a.status, 'id:', a.body?.id?.slice(0, 8));
  const aliceJar = cookies[cookies.length - 1];

  cookies = [];
  const b = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ username: 'diag-bob' }) });
  console.log('bob login:', b.status, 'id:', b.body?.id?.slice(0, 8));
  const bobId = b.body.id;
  const bobJar = cookies[cookies.length - 1];

  cookies = [aliceJar];
  const s = await api('/servers', { method: 'POST', body: JSON.stringify({ name: 'Diag Server' }) });
  console.log('create server:', s.status, 'id:', s.body?.id?.slice(0, 8));
  const serverId = s.body.id;

  const add = await api('/servers/' + serverId + '/members', { method: 'POST', body: JSON.stringify({ userId: bobId }) });
  console.log('add bob:', add.status, JSON.stringify(add.body).slice(0, 200));

  const mem = await api('/servers/' + serverId + '/members');
  console.log('members:', mem.status, 'count:', Array.isArray(mem.body) ? mem.body.length : 'not array', JSON.stringify(mem.body).slice(0, 200));

  const notif = await api('/notifications');
  console.log('notifications:', notif.status, 'isArray:', Array.isArray(notif.body), JSON.stringify(notif.body).slice(0, 200));

  const fr = await api('/friends/requests');
  console.log('friends/requests:', fr.status, 'isArray:', Array.isArray(fr.body), JSON.stringify(fr.body).slice(0, 200));

  cookies = [];
  const cfg = await api('/config');
  console.log('config (no-auth):', cfg.status, JSON.stringify(cfg.body).slice(0, 200));
}
main().catch(e => console.error(e));