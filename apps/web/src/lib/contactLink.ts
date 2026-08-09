export type ContactLink = { friendCode: string; username: string };

export function readContactLink(search: string): ContactLink {
  const params = new URLSearchParams(search);
  const friendCode = (params.get('friendCode') ?? '').replace(/\D/g, '').slice(0, 8);
  const username = (params.get('username') ?? '').trim().replace(/^@/, '').slice(0, 64);
  return { friendCode: /^\d{8}$/.test(friendCode) ? friendCode : '', username };
}

export function clearContactLinkUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  const params = new URLSearchParams(location.search);
  params.delete('friendCode');
  params.delete('username');
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}
