// Server-provided config (GET /api/config). Fetched once at boot.
// Provides shareBaseUrl for embed detection and any other server-side flags.
import { create } from 'zustand';
import { api } from '../../stores/session';

interface ServerConfig {
  shareBaseUrl: string | null; // null = not yet fetched
}

interface ServerConfigState extends ServerConfig {
  fetch(): Promise<void>;
}

export const useServerConfig = create<ServerConfigState>((set, get) => ({
  shareBaseUrl: null,

  async fetch() {
    if (get().shareBaseUrl !== null) return;
    try {
      const cfg = await api.request<{ shareBaseUrl?: string; jellyfinUrl?: string }>('/config');
      set({ shareBaseUrl: cfg.shareBaseUrl ?? '' });
    } catch {
      set({ shareBaseUrl: '' });
    }
  },
}));
