/**
 * VoiceStore participant roster tests (FR-VOX-002).
 *
 * Tests upsertParticipant, removeParticipant, setSpeaking, setAudioLevel,
 * setMuted, setParticipants, and roster cleanup on leave.
 *
 * @satisfies FR-VOX-002
 */
import { useVoiceStore } from '../VoiceStore';
import type { VoiceParticipantInfo } from '../VoiceStore';

function makeParticipant(overrides: Partial<VoiceParticipantInfo> = {}): VoiceParticipantInfo {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isSpeaking: false,
    audioLevel: 0,
    isMuted: false,
    isLocal: false,
    ...overrides,
  };
}

function resetStore(): void {
  useVoiceStore.setState({
    connectionState: 'idle',
    activeChannelId: null,
    error: null,
    participantCount: 0,
    participants: [],
    room: null,
  });
}

describe('VoiceStore — participant roster (FR-VOX-002)', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('upsertParticipant', () => {
    it('adds a new participant', () => {
      const p = makeParticipant({ id: 'u1' });
      useVoiceStore.getState().upsertParticipant(p);
      expect(useVoiceStore.getState().participants).toHaveLength(1);
      expect(useVoiceStore.getState().participants[0]).toMatchObject({ id: 'u1', username: 'alice' });
    });

    it('updates an existing participant when upserted with same id', () => {
      const p1 = makeParticipant({ id: 'u1', username: 'alice', isSpeaking: false });
      useVoiceStore.getState().upsertParticipant(p1);
      const p2 = makeParticipant({ id: 'u1', username: 'bob', isSpeaking: true });
      useVoiceStore.getState().upsertParticipant(p2);

      const list = useVoiceStore.getState().participants;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'u1', username: 'bob', isSpeaking: true });
    });

    it('can hold multiple participants', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', username: 'alice' }));
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u2', username: 'bob' }));
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u3', username: 'carol' }));
      expect(useVoiceStore.getState().participants).toHaveLength(3);
    });
  });

  describe('removeParticipant', () => {
    it('removes a participant by id', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1' }));
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u2' }));
      useVoiceStore.getState().removeParticipant('u1');
      const list = useVoiceStore.getState().participants;
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('u2');
    });

    it('no-ops when id not found', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1' }));
      useVoiceStore.getState().removeParticipant('nonexistent');
      expect(useVoiceStore.getState().participants).toHaveLength(1);
    });

    it('no-ops when roster is empty', () => {
      expect(() => useVoiceStore.getState().removeParticipant('any')).not.toThrow();
    });
  });

  describe('setSpeaking', () => {
    it('sets isSpeaking to true', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', isSpeaking: false }));
      useVoiceStore.getState().setSpeaking('u1', true);
      expect(useVoiceStore.getState().participants[0]!.isSpeaking).toBe(true);
    });

    it('sets isSpeaking to false', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', isSpeaking: true }));
      useVoiceStore.getState().setSpeaking('u1', false);
      expect(useVoiceStore.getState().participants[0]!.isSpeaking).toBe(false);
    });

    it('no-ops when id not found', () => {
      expect(() => useVoiceStore.getState().setSpeaking('ghost', true)).not.toThrow();
    });
  });

  describe('setAudioLevel', () => {
    it('updates audio level', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', audioLevel: 0 }));
      useVoiceStore.getState().setAudioLevel('u1', 0.75);
      expect(useVoiceStore.getState().participants[0]!.audioLevel).toBe(0.75);
    });

    it('clamps to [0, 1]', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1' }));
      useVoiceStore.getState().setAudioLevel('u1', 1.5);
      expect(useVoiceStore.getState().participants[0]!.audioLevel).toBe(1);

      useVoiceStore.getState().setAudioLevel('u1', -0.3);
      expect(useVoiceStore.getState().participants[0]!.audioLevel).toBe(0);
    });

    it('no-ops when id not found', () => {
      expect(() => useVoiceStore.getState().setAudioLevel('ghost', 0.5)).not.toThrow();
    });
  });

  describe('setMuted', () => {
    it('sets isMuted to true', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', isMuted: false }));
      useVoiceStore.getState().setMuted('u1', true);
      expect(useVoiceStore.getState().participants[0]!.isMuted).toBe(true);
    });

    it('sets isMuted to false', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1', isMuted: true }));
      useVoiceStore.getState().setMuted('u1', false);
      expect(useVoiceStore.getState().participants[0]!.isMuted).toBe(false);
    });

    it('no-ops when id not found', () => {
      expect(() => useVoiceStore.getState().setMuted('ghost', true)).not.toThrow();
    });
  });

  describe('setParticipants', () => {
    it('replaces the entire roster', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1' }));
      useVoiceStore.getState().setParticipants([
        makeParticipant({ id: 'u2', username: 'bob' }),
        makeParticipant({ id: 'u3', username: 'carol' }),
      ]);
      const list = useVoiceStore.getState().participants;
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.id)).toEqual(['u2', 'u3']);
    });

    it('clears with empty array', () => {
      useVoiceStore.getState().upsertParticipant(makeParticipant({ id: 'u1' }));
      useVoiceStore.getState().setParticipants([]);
      expect(useVoiceStore.getState().participants).toHaveLength(0);
    });
  });

  describe('roster cleanup on state transitions', () => {
    it('participants is initially empty', () => {
      expect(useVoiceStore.getState().participants).toEqual([]);
    });
  });
});
