import { create } from 'zustand';
import type { User, Server, Channel, Message } from './lib/types';

interface StoreState {
  currentUser: User | null;
  servers: Server[];
  currentChannelId: string | null;
  messagesByChannel: Record<string, Message[]>;
  setCurrentUser: (user: User) => void;
  setServers: (servers: Server[]) => void;
  setCurrentChannelId: (channelId: string) => void;
  appendMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, message: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  currentUser: null,
  servers: [],
  currentChannelId: null,
  messagesByChannel: {},

  setCurrentUser: (user) => set({ currentUser: user }),

  setServers: (servers) => set({ servers }),

  setCurrentChannelId: (channelId) => set({ currentChannelId: channelId }),

  appendMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      };
    }),

  updateMessage: (channelId, updatedMessage) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((msg) =>
            msg.id === updatedMessage.id ? updatedMessage : msg
          ),
        },
      };
    }),

  removeMessage: (channelId, messageId) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.filter((msg) => msg.id !== messageId),
        },
      };
    }),
}));
