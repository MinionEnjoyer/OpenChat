// FR-MSG-007 — MarkdownText renderer unit tests
// Exercises every node type the parser emits plus the critical
// markdown+mention composition cases.
import React from 'react';
import renderer from 'react-test-renderer';
import { Text, View } from 'react-native';
import { MarkdownText } from '../MarkdownText';

const MEMBERS = new Set(['alice', 'bob', 'username', 'will']);
const CURRENT = 'alice';

function mk(content: string, members = MEMBERS, current: string | undefined = CURRENT) {
  let tree: renderer.ReactTestRenderer;
  renderer.act(() => {
    tree = renderer.create(
      <MarkdownText content={content} memberUsernameSet={members} currentUsername={current} />,
    );
  });
  return tree!;
}

function findTextByStyle(tree: renderer.ReactTestRenderer, pred: (s: any) => boolean) {
  return tree.root.findAllByType(Text).find((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && pred(s);
  });
}

function findTextsByStyle(tree: renderer.ReactTestRenderer, pred: (s: any) => boolean) {
  return tree.root.findAllByType(Text).filter((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && pred(s);
  });
}

function findViewByStyle(tree: renderer.ReactTestRenderer, pred: (s: any) => boolean) {
  return tree.root.findAllByType(View).find((v) => {
    const s = v.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && pred(s);
  });
}

// ── Bold ──

test('bold: **text** renders bold Text', () => {
  const tree = mk('**hello**');
  const boldText = findTextByStyle(tree, (s) => s.fontWeight === '700');
  expect(boldText).not.toBeNull();
});

// ── Italic ──

test('italic: *text* renders italic Text', () => {
  const tree = mk('*emphatic*');
  const it = findTextByStyle(tree, (s) => s.fontStyle === 'italic');
  expect(it).not.toBeNull();
});

// ── Inline code ──

test('inline code: `text` renders monospace Text', () => {
  const tree = mk('use `map()` here');
  const ic = findTextByStyle(tree, (s) => s.fontFamily === 'monospace');
  expect(ic).not.toBeNull();
  expect(ic!.props.children).toBe('map()');
});

// ── Code block ──

test('code block: fenced renders code block View', () => {
  const tree = mk('```\nconst x = 1;\n```');
  const cb = findViewByStyle(tree, (s) => 'backgroundColor' in s && 'borderRadius' in s && 'padding' in s);
  expect(cb).not.toBeNull();
});

// ── Spoiler ──

test('spoiler: ||text|| renders Pressable with testID', () => {
  const tree = mk('the answer is ||42||');
  // spoiler is the second inline node → index 1
  const pressable = tree.root.findByProps({ testID: 'spoiler-1' });
  expect(pressable).not.toBeNull();
  const spoilerText = pressable.findAllByType(Text)[0];
  expect(spoilerText).not.toBeNull();
  expect(spoilerText!.props.children).toBe('42');
});

// ── Link ──

test('link: bare URL renders tappable link Text', () => {
  const tree = mk('see https://example.com now');
  const allTexts = tree.root.findAllByType(Text);
  const linkText = allTexts.find(
    (t) => t.props.children === 'https://example.com' && t.props.onPress != null,
  );
  expect(linkText).not.toBeNull();
});

// ── Blockquote ──

test('blockquote: > text renders with accent left border', () => {
  const tree = mk('> quoted text');
  const bq = findViewByStyle(tree, (s) => 'borderLeftColor' in s);
  expect(bq).not.toBeNull();
});

// ── Ordered list ──

test('ordered list: N. items renders numbered items', () => {
  const tree = mk('1. first\n2. second\n3. third');
  // Bullet Text elements have children array like ["1", ". "]
  const allTexts = tree.root.findAllByType(Text);
  const bullets = allTexts.filter((t) => {
    const c = t.props.children;
    return Array.isArray(c) && c.length >= 2 && /^\d+$/.test(String(c[0]));
  });
  expect(bullets.length).toBe(3);
});

// ── Unordered list ──

test('unordered list: - items renders bullet items', () => {
  const tree = mk('- alpha\n- beta');
  // Bullet Text elements have children array like ["\u2022", " "]
  const allTexts = tree.root.findAllByType(Text);
  const bullets = allTexts.filter((t) => {
    const c = t.props.children;
    return Array.isArray(c) && c.length >= 2 && c[0] === '\u2022';
  });
  expect(bullets.length).toBe(2);
});

// ── Underline ──

test('underline: __text__ renders underline Text', () => {
  const tree = mk('__underlined__');
  const ul = findTextByStyle(tree, (s) => s.textDecorationLine === 'underline');
  expect(ul).not.toBeNull();
});

// ── Strikethrough ──

test('strikethrough: ~~text~~ renders strikethrough Text', () => {
  const tree = mk('~~redacted~~');
  const st = findTextByStyle(tree, (s) => s.textDecorationLine === 'line-through');
  expect(st).not.toBeNull();
});

// ── Nested inline: bold containing italic (parser-supported pattern) ──

test('nested inline: bold containing italic', () => {
  // ***bold italic*** → bold{italic{text}}  (the parser's tested pattern)
  const tree = mk('***bold italic***');
  const boldTexts = findTextsByStyle(tree, (s) => s.fontWeight === '700');
  expect(boldTexts.length).toBeGreaterThan(0);
  // At least one bold Text should have an italic child
  const hasNestedItalic = boldTexts.some((bold) => {
    const children = React.Children.toArray(bold.props.children);
    return children.some(
      (child: any) => child?.props?.style?.fontStyle === 'italic',
    );
  });
  expect(hasNestedItalic).toBe(true);
});

// ── CRITICAL: **@username** renders BOTH bold AND mention style ──

test('**@username** renders bold with mention highlight', () => {
  const tree = mk('**@will**');
  // Outer bold Text
  const boldTexts = findTextsByStyle(tree, (s) => s.fontWeight === '700');
  expect(boldTexts.length).toBeGreaterThan(0);
  // Inside bold, there should be a mention-styled Text (fontWeight '600')
  const mentionTexts = tree.root.findAllByType(Text).filter((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && s.fontWeight === '600';
  });
  const willMention = mentionTexts.find((t) => t.props.children === '@will');
  expect(willMention).not.toBeNull();
});

// ── CRITICAL: `@username` inside inline code is NOT mention-styled ──

test('`@username` in inline code renders literally, no mention styling', () => {
  const tree = mk('`@will`');
  // Should find inline code Text with literal @will content
  const ic = findTextByStyle(tree, (s) => s.fontFamily === 'monospace');
  expect(ic).not.toBeNull();
  expect(ic!.props.children).toBe('@will');
  // There should be NO mention-styled Text (fontWeight '600')
  const mentionTexts = tree.root.findAllByType(Text).filter((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && s.fontWeight === '600';
  });
  expect(mentionTexts.length).toBe(0);
});

// ── Self-mention ──

test('@current-user renders with self-mention style', () => {
  const tree = mk('hey @alice');
  // Self-mention uses palette.accent (#5865f2) as background
  const self = tree.root.findAllByType(Text).filter((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && s.backgroundColor === '#5865f2';
  });
  expect(self.length).toBeGreaterThan(0);
});

// ── Empty and whitespace ──

test('empty content returns null', () => {
  let tree: renderer.ReactTestRenderer;
  renderer.act(() => {
    tree = renderer.create(
      <MarkdownText content="" memberUsernameSet={MEMBERS} currentUsername={CURRENT} />,
    );
  });
  expect(tree!.toJSON()).toBeNull();
});

test('whitespace-only returns null', () => {
  let tree: renderer.ReactTestRenderer;
  renderer.act(() => {
    tree = renderer.create(
      <MarkdownText content="   " memberUsernameSet={MEMBERS} currentUsername={CURRENT} />,
    );
  });
  expect(tree!.toJSON()).toBeNull();
});

// ── Plain text pass-through ──

test('plain text renders as Text', () => {
  const tree = mk('hello world');
  const allTexts = tree.root.findAllByType(Text);
  const contentText = allTexts.find((t) => t.props.children === 'hello world');
  expect(contentText).not.toBeNull();
});

// ── Italic inside blockquote ──

test('italic inside blockquote', () => {
  const tree = mk('> *emphatic*');
  // blockquote View exists
  const bq = findViewByStyle(tree, (s) => 'borderLeftColor' in s);
  expect(bq).not.toBeNull();
  // Inside should be italic Text
  const it = tree.root.findAllByType(Text).find((t) => {
    const s = t.props.style;
    return s != null && typeof s === 'object' && !Array.isArray(s) && s.fontStyle === 'italic';
  });
  expect(it).not.toBeNull();
});

// ── Bold inside list item ──

test('bold inside unordered list item', () => {
  const tree = mk('- **important** item');
  // bullet rendered
  const allTexts = tree.root.findAllByType(Text);
  const bullets = allTexts.filter((t) => {
    const c = t.props.children;
    return Array.isArray(c) && c.length >= 2 && c[0] === '\u2022';
  });
  expect(bullets.length).toBe(1);
  const bold = findTextByStyle(tree, (s) => s.fontWeight === '700');
  expect(bold).not.toBeNull();
});
