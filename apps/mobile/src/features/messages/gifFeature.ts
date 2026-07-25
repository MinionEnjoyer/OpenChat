// FR-MSG-014 — GIF feature flag
// Probes GET /api/gifs/search?q= once to determine if GIPHY_API_KEY is configured.
// The server returns 400 ("GIF search is not configured") when the key is absent.
// Derives the flag from reality rather than assuming a config field exists.
import { create } from 'zustand';
import { api } from '../../stores/session';

interface GifFeatureState {
  /** null = not yet probed, true = available, false = not configured */
  enabled: boolean | null;
  /** Probe the GIF endpoint once. Idempotent — second call is a no-op. */
  probe(): Promise<void>;
}

export const useGifFeature = create<GifFeatureState>((set, get) => ({
  enabled: null,

  async probe() {
    if (get().enabled !== null) return; // already probed
    try {
      await api.request('/gifs/search?q=');
      set({ enabled: true });
    } catch {
      set({ enabled: false });
    }
  },
}));
