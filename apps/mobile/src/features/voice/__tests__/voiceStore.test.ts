/**
 * VoiceStore unit tests — state transitions, join/leave orchestration,
 * idempotency, error paths. Tests mock the VoiceService; no network calls.
 *
 * @satisfies FR-VOX-001
 * @satisfies FR-VOX-006
 */
import { useVoiceStore, injectVoiceService } from '../VoiceStore';
import { VoiceService } from '../VoiceService';

// ── helpers ──

interface MockSvc extends VoiceService {
  joinedChannels: string[];
  leftChannels: string[];
  mockApi: { request: jest.Mock };
}

function makeMockService(): MockSvc {
  const joinedChannels: string[] = [];
  const leftChannels: string[] = [];

  const mockApi = {
    request: jest.fn(async (_path: string, init: { method?: string }) => {
      const path = String(_path);
      if (init.method === 'POST' && path.startsWith('/voice/') && path.endsWith('/join')) {
        const channelId = path.split('/')[2];
        if (channelId) joinedChannels.push(channelId);
        return { url: 'ws://lk:7880', token: 'tok', room: channelId };
      }
      if (init.method === 'POST' && path.startsWith('/voice/') && path.endsWith('/leave')) {
        const channelId = path.split('/')[2];
        if (channelId) leftChannels.push(channelId);
        return { success: true };
      }
      throw new Error('Unexpected request: ' + init.method + ' ' + path);
    }),
  };

  const svc = new VoiceService(mockApi as any);
  (svc as any).joinedChannels = joinedChannels;
  (svc as any).leftChannels = leftChannels;
  (svc as any).mockApi = mockApi;
  return svc as unknown as MockSvc;
}

function resetStore(): void {
  useVoiceStore.setState({
    connectionState: 'idle',
    activeChannelId: null,
    error: null,
    participantCount: 0,
    room: null,
    cameraEnabled: false,
    cameraFacing: 'front',
  });
}

// ── tests ──

describe('VoiceStore', () => {
  let svc: MockSvc;

  beforeEach(() => {
    svc = makeMockService();
    injectVoiceService(svc as unknown as VoiceService);
    resetStore();
  });

  afterEach(() => {
    injectVoiceService(null as unknown as VoiceService);
  });

  describe('initial state', () => {
    it('starts idle with no active channel', () => {
      const state = useVoiceStore.getState();
      expect(state.connectionState).toBe('idle');
      expect(state.activeChannelId).toBeNull();
      expect(state.error).toBeNull();
      expect(state.participantCount).toBe(0);
      expect(state.room).toBeNull();
    });
  });

  describe('join', () => {
    it('transitions idle to joining to connected on success', async () => {
      await useVoiceStore.getState().join('chan-1');

      const final = useVoiceStore.getState();
      expect(final.activeChannelId).toBe('chan-1');
      expect(final.connectionState).toBe('connected');
      expect(final.error).toBeNull();
    });

    it('returns the VoiceJoinResponse on success', async () => {
      const result = await useVoiceStore.getState().join('chan-1');
      expect(result).toEqual({ url: 'ws://lk:7880', token: 'tok', room: 'chan-1' });
    });

    it('no-ops if already connected to same channel', async () => {
      await useVoiceStore.getState().join('chan-1');
      expect(useVoiceStore.getState().activeChannelId).toBe('chan-1');

      const result = await useVoiceStore.getState().join('chan-1');
      expect(result).toBeUndefined();
      expect(svc.joinedChannels).toEqual(['chan-1']);
    });

    it('auto-leaves previous channel when joining a different one', async () => {
      await useVoiceStore.getState().join('chan-1');
      expect(useVoiceStore.getState().activeChannelId).toBe('chan-1');

      await useVoiceStore.getState().join('chan-2');
      expect(useVoiceStore.getState().activeChannelId).toBe('chan-2');

      expect(svc.leftChannels).toEqual(['chan-1']);
      expect(svc.joinedChannels).toEqual(['chan-1', 'chan-2']);
    });

    it('sets error and resets to idle on API failure', async () => {
      svc.mockApi.request = jest.fn(async () => {
        const err: Error & { status?: number } = new Error('API down');
        err.status = 500;
        throw err;
      });

      const store = useVoiceStore.getState();
      await expect(store.join('chan-1')).rejects.toThrow('API down');

      const final = useVoiceStore.getState();
      expect(final.connectionState).toBe('idle');
      expect(final.activeChannelId).toBeNull();
      expect(final.error).toBe('API down');
    });
  });

  describe('leave', () => {
    it('transitions connected to idle on leave', async () => {
      await useVoiceStore.getState().join('chan-1');
      expect(useVoiceStore.getState().connectionState).toBe('connected');

      await useVoiceStore.getState().leave();
      const final = useVoiceStore.getState();
      expect(final.connectionState).toBe('idle');
      expect(final.activeChannelId).toBeNull();
      expect(final.participantCount).toBe(0);
    });

    it('no-ops if not connected', async () => {
      await useVoiceStore.getState().leave();
      expect(useVoiceStore.getState().connectionState).toBe('idle');
      expect(svc.leftChannels).toEqual([]);
    });

    it('calls POST /voice/:id/leave on the API', async () => {
      await useVoiceStore.getState().join('chan-1');
      await useVoiceStore.getState().leave();
      expect(svc.leftChannels).toEqual(['chan-1']);
    });

    it('disconnects room if one exists', async () => {
      await useVoiceStore.getState().join('chan-1');
      const mockRoom = { disconnect: jest.fn() };
      useVoiceStore.getState().setRoom(mockRoom);

      await useVoiceStore.getState().leave();

      expect(mockRoom.disconnect).toHaveBeenCalled();
      expect(useVoiceStore.getState().room).toBeNull();
    });

    it('goes idle even if API leave fails', async () => {
      await useVoiceStore.getState().join('chan-1');
      useVoiceStore.getState().setRoom({ disconnect: jest.fn() });

      // Make leave fail
      svc.mockApi.request = jest.fn(async (path: string) => {
        if (path.includes('/leave')) throw new Error('network');
        return { success: true };
      });

      await useVoiceStore.getState().leave();

      expect(useVoiceStore.getState().connectionState).toBe('idle');
    });
  });

  describe('setters', () => {
    it('setRoom updates the room ref', () => {
      const mockRoom = { test: true };
      useVoiceStore.getState().setRoom(mockRoom);
      expect(useVoiceStore.getState().room).toBe(mockRoom);
    });

    it('setConnectionState updates state', () => {
      useVoiceStore.getState().setConnectionState('joining');
      expect(useVoiceStore.getState().connectionState).toBe('joining');
    });

    it('setParticipantCount updates count', () => {
      useVoiceStore.getState().setParticipantCount(3);
      expect(useVoiceStore.getState().participantCount).toBe(3);
    });

    it('clearError clears error', () => {
      useVoiceStore.setState({ error: 'something broke' });
      useVoiceStore.getState().clearError();
      expect(useVoiceStore.getState().error).toBeNull();
    });
  });

  // ── Mute state (FR-VOX-003) ──

  describe('FR-VOX-003 mute controls', () => {
    it('syncMicFromTrack reads actual mic track state and sets isMuted', () => {
      // Simulate the real condition: mic is actually enabled (unmuted) at track level
      useVoiceStore.setState({
        room: { localParticipant: { isMicrophoneEnabled: true } },
        isMuted: false,
      });
      useVoiceStore.getState().syncMicFromTrack();
      expect(useVoiceStore.getState().isMuted).toBe(false);

      // Now simulate the bug condition: mic is actually muted but store says unmuted
      useVoiceStore.setState({
        room: { localParticipant: { isMicrophoneEnabled: false } },
        isMuted: false,
      });
      useVoiceStore.getState().syncMicFromTrack();
      // This MUST be true — the store reflects the actual track state
      expect(useVoiceStore.getState().isMuted).toBe(true);
    });

    it('syncMicFromTrack is a no-op when localParticipant is missing isMicrophoneEnabled', () => {
      useVoiceStore.setState({
        room: { localParticipant: {} },
        isMuted: false,
      });
      useVoiceStore.getState().syncMicFromTrack();
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });

    it('syncMicFromTrack is a no-op when room is null', () => {
      useVoiceStore.setState({ room: null, isMuted: false });
      useVoiceStore.getState().syncMicFromTrack();
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });

    it('muteOnJoin disables mic and sets isMuted to true', async () => {
      const setMic = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        room: {
          localParticipant: {
            setMicrophoneEnabled: setMic,
            isMicrophoneEnabled: false,
          },
        },
        isMuted: false,
      });

      await useVoiceStore.getState().muteOnJoin();

      expect(setMic).toHaveBeenCalledWith(false);
      expect(useVoiceStore.getState().isMuted).toBe(true);
    });

    it('muteOnJoin is a no-op when room has no localParticipant', async () => {
      useVoiceStore.setState({ room: null, isMuted: false });
      await useVoiceStore.getState().muteOnJoin();
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });

    it('ONE tap of toggleMute toggles the actual track state', () => {
      const setMic = jest.fn();
      useVoiceStore.setState({
        room: { localParticipant: { setMicrophoneEnabled: setMic } },
        isMuted: false,
        isDeafened: false,
      });

      // One tap: should mute (disable mic)
      useVoiceStore.getState().toggleMute();

      expect(setMic).toHaveBeenCalledTimes(1);
      expect(setMic).toHaveBeenCalledWith(false);
      expect(useVoiceStore.getState().isMuted).toBe(true);

      // Second tap: should unmute (enable mic)
      useVoiceStore.getState().toggleMute();

      expect(setMic).toHaveBeenCalledTimes(2);
      expect(setMic).toHaveBeenLastCalledWith(true);
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });

    it('toggleMute is blocked while deafened', () => {
      const setMic = jest.fn();
      useVoiceStore.setState({
        room: { localParticipant: { setMicrophoneEnabled: setMic } },
        isMuted: true,
        isDeafened: true,
      });

      useVoiceStore.getState().toggleMute();

      expect(setMic).not.toHaveBeenCalled();
      expect(useVoiceStore.getState().isMuted).toBe(true);
    });

    it('toggleMute handles room without localParticipant gracefully', () => {
      useVoiceStore.setState({ room: null, isMuted: false, isDeafened: false });
      useVoiceStore.getState().toggleMute();
      expect(useVoiceStore.getState().isMuted).toBe(true);
    });

    it('toggleDeafen sets isMuted true when deafening, clears both when undefeating', () => {
      const setMic = jest.fn();
      useVoiceStore.setState({
        room: { localParticipant: { setMicrophoneEnabled: setMic } },
        isMuted: false,
        isDeafened: false,
      });

      // Deafen
      useVoiceStore.getState().toggleDeafen();
      expect(setMic).toHaveBeenCalledWith(false);
      expect(useVoiceStore.getState().isDeafened).toBe(true);
      expect(useVoiceStore.getState().isMuted).toBe(true);

      // Undeafen
      useVoiceStore.getState().toggleDeafen();
      expect(setMic).toHaveBeenLastCalledWith(true);
      expect(useVoiceStore.getState().isDeafened).toBe(false);
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });
  });

  // ── Video state (FR-VOX-006) ──
  describe('FR-VOX-006 camera video', () => {
    it('cameraEnabled defaults to false', () => {
      expect(useVoiceStore.getState().cameraEnabled).toBe(false);
    });

    it('cameraFacing defaults to front', () => {
      expect(useVoiceStore.getState().cameraFacing).toBe('front');
    });

    it('toggleCamera is a no-op when room is null', async () => {
      useVoiceStore.setState({ cameraEnabled: false, room: null });
      await useVoiceStore.getState().toggleCamera();
      expect(useVoiceStore.getState().cameraEnabled).toBe(false);
    });

    it('toggleCamera enables camera when room has localParticipant.setCameraEnabled', async () => {
      const setCamera = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        cameraEnabled: false,
        room: { localParticipant: { setCameraEnabled: setCamera } },
      });

      await useVoiceStore.getState().toggleCamera();

      expect(useVoiceStore.getState().cameraEnabled).toBe(true);
      expect(setCamera).toHaveBeenCalledWith(true, { facingMode: 'user' });
    });

    it('toggleCamera disables camera when already enabled', async () => {
      const setCamera = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        cameraEnabled: true,
        room: { localParticipant: { setCameraEnabled: setCamera } },
      });

      await useVoiceStore.getState().toggleCamera();

      expect(useVoiceStore.getState().cameraEnabled).toBe(false);
      expect(setCamera).toHaveBeenCalledWith(false);
    });

    it('flipCamera is a no-op when room is null', async () => {
      useVoiceStore.setState({ cameraEnabled: true, cameraFacing: 'front', room: null });
      await useVoiceStore.getState().flipCamera();
      expect(useVoiceStore.getState().cameraFacing).toBe('front');
    });

    it('flipCamera is a no-op when camera is not enabled', async () => {
      const setCamera = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        cameraEnabled: false,
        cameraFacing: 'front',
        room: { localParticipant: { setCameraEnabled: setCamera } },
      });

      await useVoiceStore.getState().flipCamera();

      expect(useVoiceStore.getState().cameraFacing).toBe('front');
      expect(setCamera).not.toHaveBeenCalled();
    });

    it('flipCamera switches front to back', async () => {
      const setCamera = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        cameraEnabled: true,
        cameraFacing: 'front',
        room: { localParticipant: { setCameraEnabled: setCamera } },
      });

      await useVoiceStore.getState().flipCamera();

      expect(useVoiceStore.getState().cameraFacing).toBe('back');
      expect(setCamera).toHaveBeenCalledWith(true, { facingMode: 'environment' });
    });

    it('flipCamera switches back to front', async () => {
      const setCamera = jest.fn().mockResolvedValue(undefined);
      useVoiceStore.setState({
        cameraEnabled: true,
        cameraFacing: 'back',
        room: { localParticipant: { setCameraEnabled: setCamera } },
      });

      await useVoiceStore.getState().flipCamera();

      expect(useVoiceStore.getState().cameraFacing).toBe('front');
      expect(setCamera).toHaveBeenCalledWith(true, { facingMode: 'user' });
    });

    it('leave resets cameraEnabled and cameraFacing to defaults', async () => {
      useVoiceStore.setState({
        connectionState: 'connected',
        activeChannelId: 'chan-1',
        cameraEnabled: true,
        cameraFacing: 'back',
        room: {
          localParticipant: { setCameraEnabled: jest.fn() },
          disconnect: jest.fn(),
        },
      });

      await useVoiceStore.getState().leave();

      expect(useVoiceStore.getState().cameraEnabled).toBe(false);
      expect(useVoiceStore.getState().cameraFacing).toBe('front');
    });

    it('setCameraFacing updates facing directly', () => {
      useVoiceStore.getState().setCameraFacing('back');
      expect(useVoiceStore.getState().cameraFacing).toBe('back');
    });
  });
});
