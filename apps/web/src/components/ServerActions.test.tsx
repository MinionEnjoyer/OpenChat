import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerActions } from './ServerActions';
import { createServer } from '../lib/api';

vi.mock('../lib/api', () => ({ createServer: vi.fn() }));
vi.mock('../lib/social', () => ({ createInvite: vi.fn(), acceptInvite: vi.fn(), getInvite: vi.fn() }));

describe('ServerActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a server from the shared centered dialog', async () => {
    vi.mocked(createServer).mockResolvedValue({ id: 'server-1', name: 'Anchor QA' } as never);
    const onChanged = vi.fn();
    render(<ServerActions activeServerId={null} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: '＋ Add a Server' }));
    fireEvent.click(screen.getByRole('button', { name: '✨ Create a Server' }));
    expect(screen.getByRole('dialog')).toHaveClass('chat-option-dialog');

    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'Anchor QA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));

    await waitFor(() => expect(createServer).toHaveBeenCalledWith('Anchor QA'));
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
