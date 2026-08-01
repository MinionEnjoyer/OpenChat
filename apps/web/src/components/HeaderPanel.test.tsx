import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderPanel } from './HeaderPanel';

describe('HeaderPanel', () => {
  it('uses the shared centered dialog surface', () => {
    render(<HeaderPanel title="Search" onClose={() => undefined}><p>Results</p></HeaderPanel>);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('chat-option-dialog');
    expect(document.querySelector('.chat-option-backdrop')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('closes from Escape, the close button, and the backdrop', () => {
    const onClose = vi.fn();
    render(<HeaderPanel title="Pinned" onClose={onClose}><p>Pins</p></HeaderPanel>);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.mouseDown(document.querySelector('.chat-option-backdrop') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
