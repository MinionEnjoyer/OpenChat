import { render, screen } from '@testing-library/react';
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
});
