/**
 * Prove the MessageActionSheet renders all actions (no 3-button Alert limit).
 *
 * The old Alert.alert path silently dropped actions beyond 3 on Android.
 * This test asserts the replacement bottom sheet renders every action passed
 * to it, including gated (absent) and destructive (danger-colour) variants.
 *
 * @satisfies DIAG-MSGRICH (ebc8215) — msg-rich-reactions fix
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { type ReactTestRendererJSON } from 'react-test-renderer';
import { MessageActionSheet } from '../MessageActionSheet';
import type { MessageAction } from '../MessageActionSheet';

/** Walk toJSON() output for a node with a given testID. */
function findByTestID(
  tree: ReactTestRendererJSON | null,
  testID: string,
): ReactTestRendererJSON | null {
  if (!tree) return null;
  if (tree.props?.testID === testID) return tree;
  for (const child of tree.children ?? []) {
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const found = findByTestID(child as ReactTestRendererJSON, testID);
      if (found) return found;
    }
  }
  return null;
}

/** Find all nodes matching a testID prefix. */
function findAllByTestIDPrefix(
  tree: ReactTestRendererJSON | null,
  prefix: string,
): ReactTestRendererJSON[] {
  const results: ReactTestRendererJSON[] = [];
  function walk(node: ReactTestRendererJSON | null) {
    if (!node) return;
    const tid = typeof node.props?.testID === 'string' ? node.props.testID : '';
    if (tid.startsWith(prefix)) results.push(node);
    for (const child of node.children ?? []) {
      if (typeof child === 'object' && child !== null && 'type' in child) {
        walk(child as ReactTestRendererJSON);
      }
    }
  }
  walk(tree);
  return results;
}

function resolveStyle(
  node: ReactTestRendererJSON,
): Record<string, unknown> | undefined {
  const s = node.props?.style;
  if (Array.isArray(s)) {
    const merged: Record<string, unknown> = {};
    for (const entry of s) {
      if (entry && typeof entry === 'object') Object.assign(merged, entry);
    }
    return merged;
  }
  return s as Record<string, unknown> | undefined;
}

// ── Helpers ──

function renderSheet(actions: MessageAction[]) {
  let tree: renderer.ReactTestRenderer;
  renderer.act(() => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { width: 412, height: 892, x: 0, y: 0 },
          insets: { top: 32, bottom: 48, left: 0, right: 0 },
        }}
      >
        <MessageActionSheet
          visible={true}
          actions={actions}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  });
  const json = tree!.toJSON();
  return Array.isArray(json) ? json[0] ?? null : json;
}

// ── Tests ──

describe('MessageActionSheet', () => {
  const fullActions: MessageAction[] = [
    { id: 'edit', label: 'Edit', onPress: jest.fn() },
    { id: 'react', label: 'React', onPress: jest.fn() },
    { id: 'pin', label: 'Pin', onPress: jest.fn() },
    { id: 'delete', label: 'Delete', destructive: true, onPress: jest.fn() },
    { id: 'copy-text', label: 'Copy text', onPress: jest.fn() },
    { id: 'copy-link', label: 'Copy link', onPress: jest.fn() },
  ];

  it('renders all six action rows plus cancel (7 total)', () => {
    const root = renderSheet(fullActions);
    expect(root).not.toBeNull();

    const actions = findAllByTestIDPrefix(root, 'msg-action-');
    // 6 action rows + 1 cancel
    expect(actions.length).toBe(7);
  });

  it('renders each action with correct testID', () => {
    const root = renderSheet(fullActions);

    expect(findByTestID(root, 'msg-action-edit')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-react')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-pin')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-delete')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-copy-text')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-copy-link')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-cancel')).not.toBeNull();
  });

  it('renders destructive action in danger colour', () => {
    const root = renderSheet(fullActions);
    const del = findByTestID(root, 'msg-action-delete');
    expect(del).not.toBeNull();

    // The Pressable contains a Text child; walk to it
    const delChildren = (del!.children ?? []) as ReactTestRendererJSON[];
    const textNode = delChildren.find(
      (c) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'Text',
    ) as ReactTestRendererJSON | undefined;
    expect(textNode).not.toBeNull();

    const style = resolveStyle(textNode!);
    expect(style?.color).toBe('#da373c'); // palette.danger
  });

  it('renders non-destructive actions in default text colour', () => {
    const root = renderSheet(fullActions);
    const edit = findByTestID(root, 'msg-action-edit');
    expect(edit).not.toBeNull();

    const editChildren = (edit!.children ?? []) as ReactTestRendererJSON[];
    const textNode = editChildren.find(
      (c) => typeof c === 'object' && c !== null && 'type' in c && c.type === 'Text',
    ) as ReactTestRendererJSON | undefined;
    expect(textNode).not.toBeNull();

    const style = resolveStyle(textNode!);
    // Should NOT have danger colour
    expect(style?.color).not.toBe('#da373c');
  });

  it('excludes gated actions when not passed', () => {
    // Simulate non-own message, non-manager: only react, copy-text, copy-link
    const restricted: MessageAction[] = [
      { id: 'react', label: 'React', onPress: jest.fn() },
      { id: 'copy-text', label: 'Copy text', onPress: jest.fn() },
      { id: 'copy-link', label: 'Copy link', onPress: jest.fn() },
    ];
    const root = renderSheet(restricted);

    // Present
    expect(findByTestID(root, 'msg-action-react')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-copy-text')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-copy-link')).not.toBeNull();
    expect(findByTestID(root, 'msg-action-cancel')).not.toBeNull();

    // Absent
    expect(findByTestID(root, 'msg-action-edit')).toBeNull();
    expect(findByTestID(root, 'msg-action-pin')).toBeNull();
    expect(findByTestID(root, 'msg-action-delete')).toBeNull();
  });

  it('respects safe-area bottom inset', () => {
    const root = renderSheet(fullActions);
    // The sheet View is the second direct child of Modal (after backdrop Pressable)
    const node = findByTestID(root, 'message-action-sheet');
    expect(node).not.toBeNull();

    const modalChildren = (node!.children ?? []) as ReactTestRendererJSON[];
    // [Pressable(backdrop), View(sheet)]
    expect(modalChildren.length).toBeGreaterThanOrEqual(2);
    const sheet = modalChildren[1] as ReactTestRendererJSON | undefined;
    expect(sheet).not.toBeNull();

    const style = resolveStyle(sheet!);
    // paddingBottom should be insets.bottom (48) + spacing.lg (24) = 72
    expect(style?.paddingBottom).toBe(72);
  });

  // ── Prove the test can fail (the old Alert path could never pass this) ──
  it('FAILS if only 3 actions were rendered (old Alert limit)', () => {
    const root = renderSheet(fullActions);
    const actions = findAllByTestIDPrefix(root, 'msg-action-');
    // The old Alert.alert on Android would only render 3 buttons.
    // Here we assert the NEW behaviour: all 7 present.
    expect(actions.length).toBeGreaterThan(3);
    expect(actions.length).toBe(7);
  });
});
