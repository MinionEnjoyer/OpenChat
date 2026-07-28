/**
 * VoiceService — typed API wrapper for voice endpoints.
 *
 * Each method calls the backend REST endpoint and returns typed responses.
 * The caller (VoiceStore / useVoiceConnection) is responsible for error
 * handling and state management.
 *
 * @satisfies FR-VOX-001
 */
import type { ApiClient } from '../../api/client';
import type { VoiceJoinResponse, VoiceLeaveResponse, VoiceParticipant } from '../../api/schema';

export class VoiceService {
  constructor(private readonly api: ApiClient) {}

  /** POST /voice/:channelId/join — mint a LiveKit token and start a VoiceSession. */
  async joinChannel(channelId: string): Promise<VoiceJoinResponse> {
    return this.api.request<VoiceJoinResponse>(`/voice/${channelId}/join`, {
      method: 'POST',
    });
  }

  /** POST /voice/:channelId/leave — close the VoiceSession. */
  async leaveChannel(channelId: string): Promise<VoiceLeaveResponse> {
    return this.api.request<VoiceLeaveResponse>(`/voice/${channelId}/leave`, {
      method: 'POST',
    });
  }

  /** GET /voice/:channelId/participants — list connected participants. */
  async getParticipants(channelId: string): Promise<VoiceParticipant[]> {
    return this.api.request<VoiceParticipant[]>(`/voice/${channelId}/participants`);
  }
}
