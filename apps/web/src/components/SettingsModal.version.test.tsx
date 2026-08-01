import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';
import { SettingsModal } from './SettingsModal';

describe('SettingsModal release identity', () => {
  it('shows the package version in the settings footer', () => {
    render(
      <SettingsModal
        user={{
          id: 'user-1', username: 'tester', displayName: 'Test User', avatarUrl: null,
          status: 'ONLINE', customStatus: null, bio: null, friendCode: 'TEST-1234',
        } as any}
        theme="dark"
        shareBaseUrl=""
        audio={{} as any}
        onThemeChange={vi.fn()}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(`OpenChat version ${packageMetadata.version}`))
      .toHaveTextContent(`OpenChat v${packageMetadata.version}`);
  });

  it('uses a mobile-friendly tabbed layout with separate content and footer regions', () => {
    const { container } = render(
      <SettingsModal
        user={{
          id: 'user-1', username: 'tester', displayName: 'Test User', avatarUrl: null,
          status: 'ONLINE', customStatus: null, bio: null, friendCode: 'TEST-1234',
        } as any}
        theme="dark"
        shareBaseUrl=""
        audio={{} as any}
        onThemeChange={vi.fn()}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tab', { name: '👤 Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('.settings-content')).toBeInTheDocument();
    expect(container.querySelector('.settings-footer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '🎨 Theme' }));
    expect(screen.getByRole('tab', { name: '🎨 Theme' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'settings-panel-appearance');
  });
});
