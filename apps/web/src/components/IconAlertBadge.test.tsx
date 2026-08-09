import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_ALERT_Z_INDEX, IconAlertBadge } from './IconAlertBadge';

describe('IconAlertBadge', () => {
  it('renders alerts above icon content without intercepting icon clicks', () => {
    render(<IconAlertBadge className="server-rail-alert-badge">4</IconAlertBadge>);

    const alert = screen.getByText('4');
    expect(ICON_ALERT_Z_INDEX).toBeGreaterThan(1);
    expect(alert).toHaveClass('icon-alert-badge', 'server-rail-alert-badge');
    expect(alert).toHaveStyle({ position: 'absolute', zIndex: '3', pointerEvents: 'none' });
  });
});
