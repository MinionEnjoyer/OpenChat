import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateGate } from './UpdateGate';

afterEach(() => {
  delete (window as any).__TAURI__;
  vi.useRealTimers();
});

describe('UpdateGate', () => {
  it('continues immediately outside the desktop runtime', async () => {
    const onDone = vi.fn();
    render(<UpdateGate onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('continues when the updater reports the app is current', async () => {
    const invoke = vi.fn().mockResolvedValue(false);
    (window as any).__TAURI__ = { core: { invoke } };
    const onDone = vi.fn();
    render(<UpdateGate onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('run_update');
  });

  it('shows install progress reported by the desktop updater', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const listen = vi.fn((name: string, handler: (event: any) => void) => {
      handlers[name] = handler;
      return Promise.resolve(vi.fn());
    });
    (window as any).__TAURI__ = {
      core: { invoke: vi.fn(() => new Promise(() => undefined)) },
      event: { listen },
    };
    const { container } = render(<UpdateGate onDone={() => undefined} />);
    await act(async () => { await Promise.resolve(); });

    act(() => {
      handlers['update://status']({ payload: 'installing' });
      handlers['update://progress']({ payload: { downloaded: 5, total: 10 } });
    });

    expect(screen.getAllByText('Installing update…').length).toBeGreaterThan(0);
    expect(container.querySelector('[style*="width: 50%"]')).toBeInTheDocument();
  });

  it('cannot hold the app indefinitely when the updater stalls', () => {
    vi.useFakeTimers();
    (window as any).__TAURI__ = {
      core: { invoke: vi.fn(() => new Promise(() => undefined)) },
    };
    const onDone = vi.fn();
    render(<UpdateGate onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(15_000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
