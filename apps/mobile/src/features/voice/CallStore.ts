/**
 * CallStore — incoming DM call state (FR-VOX-005).
 *
 * When the gateway delivers a `call.ring` frame, the sync layer populates
 * this store. The IncomingCallOverlay reads it to render the full-screen
 * accept/decline UI. On accept, the overlay calls VoiceStore.join() then
 * clears the incoming call state.
 *
 * PUBLIC SURFACE:
 *   useCallStore()              — Zustand hook
 *   state.incomingCall          — { channelId, callerId, callerName, callerAvatar } | null
 *   state.ring(params)          — called by sync layer on call.ring
 *   state.dismiss()             — decline the call
 *   state.accept()              — accept (caller calls VoiceStore.join + dismiss)
 *
 * @satisfies FR-VOX-005
 */
import { create } from 'zustand';

export interface IncomingCall {
  channelId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
}

export interface CallState {
  /** Active incoming call, or null when no call is ringing / call has been dismissed. */
  incomingCall: IncomingCall | null;

  /** Called by the sync layer when a call.ring frame arrives. */
  ring: (params: IncomingCall) => void;
  /** Dismiss the incoming call overlay (decline). */
  dismiss: () => void;
  /** Accept the incoming call (clear incoming state; caller is responsible for joining). */
  accept: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  incomingCall: null,

  ring: (params: IncomingCall) => {
    // Always update — a new ring replaces any previous.
    set({ incomingCall: params });
  },

  dismiss: () => {
    set({ incomingCall: null });
  },

  accept: () => {
    set({ incomingCall: null });
  },
}));
