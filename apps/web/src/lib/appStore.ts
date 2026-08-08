import { create } from 'zustand';
import type { Channel, DmChannel, Message, Server, ServerMemberInfo, User } from './types';
import { indexServerChannels } from './channelOwnership';

export interface AppState {
  user: User | null;
  shareBaseUrl: string;
  servers: Server[];
  channelsByServer: Record<string, Channel[]>;
  serverIdByChannel: Record<string, string>;
  messagesByChannel: Record<string, Message[]>;
  dms: DmChannel[];
  membersByServer: Record<string, ServerMemberInfo[]>;
  presenceById: Record<string, string>;
  platformsById: Record<string, string[]>;
  unreadByChannel: Record<string, number>;
  notifyTick: number;
  activeServerId: string | null;
  activeChannelId: string | null;
  set: (patch: Partial<AppState>) => void;
  setChannels: (serverId: string, channels: Channel[]) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  prependMessages: (channelId: string, older: Message[]) => void;
  appendMessages: (channelId: string, newer: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  deleteMessage: (channelId: string, id: string) => void;
  replacePending: (channelId: string, nonce: string, real: Message) => void;
  markFailed: (channelId: string, id: string) => void;
  setPresence: (userId: string, status: string) => void;
  bumpUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  shareBaseUrl: '',
  servers: [],
  channelsByServer: {},
  serverIdByChannel: {},
  messagesByChannel: {},
  dms: [],
  membersByServer: {},
  presenceById: {},
  platformsById: {},
  unreadByChannel: {},
  notifyTick: 0,
  activeServerId: null,
  activeChannelId: null,
  set: (patch) => set(patch),
  setChannels: (serverId, channels) =>
    set((state) => ({
      channelsByServer: { ...state.channelsByServer, [serverId]: channels },
      serverIdByChannel: indexServerChannels(state.serverIdByChannel, serverId, channels),
    })),
  setMessages: (channelId, messages) =>
    set((state) => ({ messagesByChannel: { ...state.messagesByChannel, [channelId]: messages } })),
  prependMessages: (channelId, older) =>
    set((state) => {
      const current = state.messagesByChannel[channelId] || [];
      const seen = new Set(current.map((message) => message.id));
      const fresh = older.filter((message) => !seen.has(message.id));
      if (fresh.length === 0) return state;
      return { messagesByChannel: { ...state.messagesByChannel, [channelId]: [...fresh, ...current] } };
    }),
  appendMessages: (channelId, newer) =>
    set((state) => {
      const current = state.messagesByChannel[channelId] || [];
      const seen = new Set(current.map((message) => message.id));
      const fresh = newer.filter((message) => !seen.has(message.id));
      if (fresh.length === 0) return state;
      return { messagesByChannel: { ...state.messagesByChannel, [channelId]: [...current, ...fresh] } };
    }),
  addMessage: (message) =>
    set((state) => {
      const current = state.messagesByChannel[message.channelId] || [];
      if (current.some((candidate) => candidate.id === message.id)) return state;
      return { messagesByChannel: { ...state.messagesByChannel, [message.channelId]: [...current, message] } };
    }),
  updateMessage: (message) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [message.channelId]: (state.messagesByChannel[message.channelId] || []).map((candidate) =>
          candidate.id === message.id ? message : candidate,
        ),
      },
    })),
  deleteMessage: (channelId, id) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).filter((message) => message.id !== id),
      },
    })),
  replacePending: (channelId, nonce, real) =>
    set((state) => {
      const current = state.messagesByChannel[channelId] || [];
      const filtered = current.filter((message) => message.nonce !== nonce && message.id !== real.id);
      return { messagesByChannel: { ...state.messagesByChannel, [channelId]: [...filtered, real] } };
    }),
  markFailed: (channelId, id) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map((message) =>
          message.id === id ? { ...message, pending: false, failed: true } : message,
        ),
      },
    })),
  setPresence: (userId, status) =>
    set((state) => ({ presenceById: { ...state.presenceById, [userId]: status } })),
  bumpUnread: (channelId) =>
    set((state) => ({ unreadByChannel: { ...state.unreadByChannel, [channelId]: (state.unreadByChannel[channelId] || 0) + 1 } })),
  clearUnread: (channelId) =>
    set((state) => {
      if (!state.unreadByChannel[channelId]) return state;
      const next = { ...state.unreadByChannel };
      delete next[channelId];
      return { unreadByChannel: next };
    }),
}));
