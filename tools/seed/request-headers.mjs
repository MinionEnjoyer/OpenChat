function hasHeader(headers, name) {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some(header => header.toLowerCase() === normalized);
}

export function prepareSeedRequestHeaders({
  method,
  body,
  headers: suppliedHeaders,
  cookie = '',
  webOrigin,
}) {
  const headers = { ...(suppliedHeaders ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (cookie && method !== 'GET' && method !== 'HEAD' && !hasHeader(headers, 'origin')) {
    headers.origin = webOrigin;
  }
  if (!hasHeader(headers, 'content-type') && method !== 'GET' && body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return headers;
}
