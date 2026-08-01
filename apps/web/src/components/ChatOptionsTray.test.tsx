import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatOptionsTray } from './ChatOptionsTray';

function renderTray(overrides: Partial<React.ComponentProps<typeof ChatOptionsTray>> = {}) {
  const props: React.ComponentProps<typeof ChatOptionsTray> = {
    shareBaseUrl: '',
    serverId: null,
    onUploaded: vi.fn(),
    onCreatePoll: vi.fn(),
    onOpenTool: vi.fn(),
    ...overrides,
  };
  render(<ChatOptionsTray {...props} />);
  return props;
}

describe('ChatOptionsTray', () => {
  it('shows only tools available without Share or a server', () => {
    renderTray();
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }));

    expect(screen.queryByText('Upload a file')).not.toBeInTheDocument();
    expect(screen.queryByText('Record a sound')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a sticker')).not.toBeInTheDocument();
    expect(screen.getByText('Create a poll')).toBeInTheDocument();
    expect(screen.getByText('Choose a GIF')).toBeInTheDocument();
    expect(screen.getByText('Choose an emoji')).toBeInTheDocument();
  });

  it('shows file, recording, and sticker actions when their dependencies exist', () => {
    renderTray({ shareBaseUrl: 'https://share.example.com', serverId: 'server-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }));

    expect(screen.getByText('Upload a file')).toBeInTheDocument();
    expect(screen.getByText('Record a sound')).toBeInTheDocument();
    expect(screen.getByText('Choose a sticker')).toBeInTheDocument();
  });

  it('dispatches a selected tool once and closes the menu', () => {
    const props = renderTray({ serverId: 'server-1' });
    const trigger = screen.getByRole('button', { name: 'Chat options' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Choose a sticker'));

    expect(props.onOpenTool).toHaveBeenCalledTimes(1);
    expect(props.onOpenTool).toHaveBeenCalledWith('sticker');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes an open menu with Escape', () => {
    renderTray();
    const trigger = screen.getByRole('button', { name: 'Chat options' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
