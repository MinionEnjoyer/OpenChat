/**
 * Strings — every user-facing string in the app (NFR-11).
 *
 * Content is English-only for v1, but nothing renders a literal: a lint rule
 * rejects literal JSX text, so adding a locale later is a data change rather
 * than a hunt through the component tree.
 */

export const strings = {
  app: {
    name: 'OpenChat',
  },
  hello: {
    title: 'OpenChat',
    subtitle: 'Skeleton build — no features yet (P0-17)',
  },
  common: {
    retry: 'Retry',
    cancel: 'Cancel',
  },
} as const;

export type Strings = typeof strings;
