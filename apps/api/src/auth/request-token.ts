type TokenRequest = {
  headers?: { authorization?: string };
  query?: { token?: unknown };
  originalUrl?: string;
  path?: string;
};

/** Query-string credentials are accepted only for authenticated media elements. */
export function requestToken(request: TokenRequest): string {
  const header = request.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  const path = request.path ?? request.originalUrl?.split('?')[0] ?? '';
  const mediaRoute = /(?:^|\/api(?:\/v1)?)\/(?:media\/|watchparty\/(?:image|stream)\/)/.test(path)
    || path.startsWith('/media/')
    || /^\/watchparty\/(?:image|stream)\//.test(path);
  return mediaRoute && typeof request.query?.token === 'string'
    ? request.query.token.trim()
    : '';
}
