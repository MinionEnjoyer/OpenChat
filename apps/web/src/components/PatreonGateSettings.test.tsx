import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { PatreonGateSettings } from './PatreonGateSettings';

vi.mock('../lib/api', () => ({
  getPatreonGate: vi.fn(),
  updatePatreonGate: vi.fn(),
  deletePatreonGate: vi.fn(),
}));

describe('PatreonGateSettings', () => {
  beforeEach(() => {
    vi.mocked(api.getPatreonGate).mockResolvedValue({
      available: true,
      gate: null,
      joinUrl: null,
    });
    vi.mocked(api.updatePatreonGate).mockReset();
    vi.mocked(api.deletePatreonGate).mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('configures a supporter threshold and exposes the shareable join URL', async () => {
    vi.mocked(api.updatePatreonGate).mockResolvedValue({
      available: true,
      gate: { campaignId: '12345', minimumCents: 750, enabled: true },
      joinUrl: 'https://chat.example.com/api/patreon/join/server-1',
    });
    render(<PatreonGateSettings serverId="server-1" />);

    fireEvent.change(await screen.findByLabelText('Patreon campaign ID'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Minimum monthly support'), { target: { value: '7.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Patreon settings' }));

    await waitFor(() => expect(api.updatePatreonGate).toHaveBeenCalledWith('server-1', {
      campaignId: '12345',
      minimumCents: 750,
      enabled: true,
    }));
    const joinUrl = await screen.findByDisplayValue('https://chat.example.com/api/patreon/join/server-1');
    expect(joinUrl).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://chat.example.com/api/patreon/join/server-1',
    ));
  });

  it('explains when the host operator has not configured Patreon OAuth', async () => {
    vi.mocked(api.getPatreonGate).mockResolvedValue({ available: false, gate: null, joinUrl: null });
    render(<PatreonGateSettings serverId="server-1" />);

    expect(await screen.findByText(/host operator must configure Patreon OAuth/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Patreon settings' })).toBeDisabled();
  });
});
