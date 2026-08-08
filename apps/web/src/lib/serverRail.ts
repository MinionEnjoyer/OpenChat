export function serverRailItemClass(active: boolean): string {
  return `server-rail-item${active ? ' server-rail-item--selected' : ''}`;
}

export function serverRailAriaCurrent(active: boolean): 'page' | undefined {
  return active ? 'page' : undefined;
}
