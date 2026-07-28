/**
 * Store tracking which blocked messages the user has revealed (FR-SOC-007).
 */
import { create } from 'zustand';

interface RevealedStore {
  /** Set of revealed message IDs. */
  revealedIds: Set<string>;
  /** Reveal a specific blocked message. */
  reveal: (id: string) => void;
  /** Reset all reveals (e.g. on channel change). */
  reset: () => void;
}

export const useRevealedStore = create<RevealedStore>((set) => ({
  revealedIds: new Set(),
  reveal: (id: string) => {
    set((prev) => ({ revealedIds: new Set(prev.revealedIds).add(id) }));
  },
  reset: () => {
    set({ revealedIds: new Set() });
  },
}));
