export type PatreonCallback = {
  inviteCode: string | null;
  error: string | null;
};

export function readPatreonCallback(search: string): PatreonCallback {
  const params = new URLSearchParams(search);
  return {
    inviteCode: params.get('patreonInvite'),
    error: params.get('patreonError'),
  };
}

export function clearPatreonCallbackUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  const params = new URLSearchParams(location.search);
  params.delete('patreonInvite');
  params.delete('patreonError');
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}
