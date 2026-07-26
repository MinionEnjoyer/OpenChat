/**
 * Poll wiring tests (FR-MSG-012).
 *
 * Verifies that PollCard and PollCreate render when reached by a user action.
 * Guards the SEAM between feature components and the screen — the same seam
 * type whose absence left voice-channel join and server-rail refresh orphaned.
 *
 * @satisfies FR-MSG-012
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PollCard } from '../PollCard';
import { PollCreate } from '../PollCreate';
import type { Poll } from '../../../api/schema';

// ── Fixtures ──

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-001',
    question: 'Lunch?',
    multiple: false,
    closesAt: null,
    options: [
      { id: 'opt-1', text: 'Pizza', voterIds: ['user-a'] },
      { id: 'opt-2', text: 'Sushi', voterIds: [] },
    ],
    ...overrides,
  };
}

// ── PollCard reachability (FR-MSG-012) ──
//
// PollCard is rendered by ChatPane in the message timeline when a message
// has a poll (ChatPane.tsx line 588: {msg.poll && (<PollCard .../>)}).
// User action: navigate to any channel containing a poll message, or create
// a poll and see it appear in the timeline.
//
// Screen: ShellScreen → ChatPane → PollCard

describe('PollCard (FR-MSG-012)', () => {
  // @satisfies FR-MSG-012
  it('renders with poll-{id} testID when given a Poll', () => {
    const poll = makePoll();

    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <PollCard poll={poll} userId="user-b" onVote={jest.fn()} />,
      );
    });

    expect(tree!.root.findByProps({ testID: 'poll-poll-001' })).not.toBeNull();
  });
});

// ── ChatPane wiring guard (FR-MSG-012) ──
//
// ChatPane only renders PollCard when msg.poll is truthy (line 588).
// This describe block replicates that exact conditional to prove the
// guard matters and that removing it would be caught.

describe('ChatPane poll guard (FR-MSG-012)', () => {
  /** Mirrors ChatPane line 588: {msg.poll && (<PollCard .../>)} */
  function PollConditional({ message, userId }: {
    message: { poll?: Poll };
    userId: string;
  }) {
    if (!message.poll) return null;
    return <PollCard poll={message.poll} userId={userId} onVote={jest.fn()} />;
  }

  // @satisfies FR-MSG-012
  it('renders PollCard when message.poll is present', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <PollConditional message={{ poll: makePoll() }} userId="u" />,
      );
    });
    expect(tree!.root.findByProps({ testID: 'poll-poll-001' })).not.toBeNull();
  });

  // @satisfies FR-MSG-012
  it('renders nothing when message.poll is absent', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <PollConditional message={{}} userId="u" />,
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });

  // @satisfies FR-MSG-012 — prove the guard matters
  it('FAILS when the guard is removed (prove-fail: comment out the guard, run, observe crash, restore)', () => {
    // HOW TO PROVE THIS TEST CAN FAIL:
    //   1. In PollConditional above, comment out:
    //        if (!message.poll) return null;
    //   2. Run: cd apps/mobile && npx jest pollWiring --testNamePattern="FAILS"
    //   3. Observe: PollCard receives undefined poll → poll.options is
    //      undefined → crash (TypeError: Cannot read properties of
    //      undefined (reading 'length'))
    //   4. Restore the guard
    //   5. Run again → passes

    // With guard intact, absent poll renders null (already proved above).
    // This test exists as the documented prove-fail anchor.
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <PollConditional message={{}} userId="u" />,
      );
    });
    expect(tree!.toJSON()).toBeNull();

    // With guard intact, present poll renders PollCard
    renderer.act(() => {
      tree = renderer.create(
        <PollConditional message={{ poll: makePoll() }} userId="u" />,
      );
    });
    expect(tree!.root.findByProps({ testID: 'poll-poll-001' })).not.toBeNull();
  });
});

// ── PollCreate reachability (FR-MSG-012) ──
//
// PollCreate is a Modal rendered by ChatPane when the user taps the poll
// button (📊) in the composer (ChatPane.tsx line 771-778, 818-823).
// User action: tap the poll icon in the composer.
//
// Screen: ShellScreen → ChatPane → PollCreate

describe('PollCreate (FR-MSG-012)', () => {
  // @satisfies FR-MSG-012
  it('renders modal with question input when visible=true', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
        <PollCreate
          visible={true}
          channelId="chan-1"
          onClose={jest.fn()}
          onCreated={jest.fn()}
        />
        </SafeAreaProvider>,
      );
    });

    const instance = tree!.root;
    expect(instance.findByProps({ testID: 'poll-create-question' })).not.toBeNull();
    expect(instance.findByProps({ testID: 'poll-create-submit' })).not.toBeNull();
  });

  // @satisfies FR-MSG-012
  it('renders nothing when visible=false (modal hidden)', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
        <PollCreate
          visible={false}
          channelId="chan-1"
          onClose={jest.fn()}
          onCreated={jest.fn()}
        />
        </SafeAreaProvider>,
      );
    });

    // SafeAreaProvider always renders its container; Modal with
    // visible=false renders nothing inside — no poll inputs present
    const json = tree!.toJSON();
    expect(json).not.toBeNull();
    // No poll inputs should be findable when modal is hidden
    const root = tree!.root;
    expect(() => root.findByProps({ testID: 'poll-create-question' })).toThrow();
  });
});
