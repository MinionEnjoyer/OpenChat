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
  auth: {
    title: 'OpenChat',
    subtitle: 'Sign in to get started',
    usernamePlaceholder: 'Username',
    devLoginButton: 'Sign in (dev)',
    loginFailed: 'Sign-in failed',
    loggingIn: 'Signing in…',
  },
  shell: {
    channelHash: '#',
    channelsFallbackTitle: 'Channels',
    noServers: 'No servers yet',
    noChannels: 'No channels',
    selectChannel: 'Select a channel',
    chatPlaceholder: 'Messages arrive in Phase 2',
    membersTitle: 'Members',
    logout: 'Sign out',
  },
  messages: {
    empty: 'No messages yet',
    composerPlaceholder: 'Message',
    send: 'Send',
    sendFailed: 'Message failed to send',
    edited: '(edited)',
    deleted: 'Message removed',
    edit: 'Edit',
    delete: 'Delete',
    copyText: 'Copy text',
    editTitle: 'Edit message',
    editSave: 'Save',
    editCancel: 'Cancel',
    deleteConfirm: 'Delete this message?',
    deleteConfirmOk: 'Delete',
    editFailed: 'Edit failed',
    deleteFailed: 'Delete failed',
  },
  connection: {
    offline: 'Offline — reconnecting…',
    connecting: 'Connecting…',
  },
  profile: {
    title: 'Account',
    displayNameLabel: 'Display name',
    save: 'Save',
    saved: 'Profile updated',
    saveFailed: 'Could not update profile',
  },
  common: {
    retry: 'Retry',
    cancel: 'Cancel',
    error: 'Something went wrong',
  },
} as const;

export type Strings = typeof strings;
