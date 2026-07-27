// FR-MSG-007 — Markdown AST renderer
// Renders parseMarkdown output into React Native components with
// mention-aware text leaves. Composes markdown + mention parsing:
// markdown AST first, then parseMentionSegments on TextNode leaves only.
import React, { useState, useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { parseMarkdown } from '../../domain/markdown';
import type { MarkdownNode, InlineNode } from '../../domain/markdown';
import { parseMentionSegments } from '../../domain/mentions';

interface Props {
  content: string;
  memberUsernameSet: Set<string>;
  currentUsername: string | undefined;
}

export function MarkdownText({ content, memberUsernameSet, currentUsername }: Props): React.JSX.Element | null {
  if (!content) return null;

  const nodes = parseMarkdown(content);
  if (nodes.length === 0) return null;

  const hasBlockNodes = nodes.some(
    (n) => n.type === 'codeBlock' || n.type === 'blockquote' || n.type === 'orderedList' || n.type === 'unorderedList',
  );

  if (hasBlockNodes) {
    return <View style={styles.blockContainer}>{renderBlockLevel(nodes, memberUsernameSet, currentUsername)}</View>;
  }

  // All inline: wrap in a single <Text> for proper text wrapping
  return (
    <Text style={styles.baseText}>
      {renderInlineNodes(nodes as InlineNode[], memberUsernameSet, currentUsername)}
    </Text>
  );
}

// ── Block-level rendering ──

function renderBlockLevel(
  nodes: MarkdownNode[],
  memberUsernameSet: Set<string>,
  currentUsername: string | undefined,
): React.ReactNode {
  const elements: React.ReactNode[] = [];
  let inlineBuffer: InlineNode[] = [];

  const flushInlineBuffer = () => {
    if (inlineBuffer.length > 0) {
      elements.push(
        <Text key={`p-${elements.length}`} style={styles.baseText}>
          {renderInlineNodes(inlineBuffer, memberUsernameSet, currentUsername)}
        </Text>,
      );
      inlineBuffer = [];
    }
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    switch (node.type) {
      case 'codeBlock':
        flushInlineBuffer();
        elements.push(<CodeBlockView key={`cb-${i}`} lang={node.lang} content={node.content} />);
        break;
      case 'blockquote':
        flushInlineBuffer();
        elements.push(
          <View key={`bq-${i}`} style={styles.blockquote}>
            {renderBlockLevel(node.children, memberUsernameSet, currentUsername)}
          </View>,
        );
        break;
      case 'orderedList':
        flushInlineBuffer();
        elements.push(
          <View key={`ol-${i}`} style={styles.listContainer}>
            {node.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.listBullet}>{node.start + j}. </Text>
                <Text style={styles.baseText}>
                  {renderInlineNodes(item.children, memberUsernameSet, currentUsername)}
                </Text>
              </View>
            ))}
          </View>,
        );
        break;
      case 'unorderedList':
        flushInlineBuffer();
        elements.push(
          <View key={`ul-${i}`} style={styles.listContainer}>
            {node.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.listBullet}>{'\u2022'} </Text>
                <Text style={styles.baseText}>
                  {renderInlineNodes(item.children, memberUsernameSet, currentUsername)}
                </Text>
              </View>
            ))}
          </View>,
        );
        break;
      default:
        inlineBuffer.push(node as InlineNode);
        break;
    }
  }
  flushInlineBuffer();

  return elements;
}

// ── Inline rendering ──

function renderInlineNodes(
  nodes: InlineNode[],
  memberUsernameSet: Set<string>,
  currentUsername: string | undefined,
): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return (
          <React.Fragment key={i}>
            {renderTextWithMentions(node.content, memberUsernameSet, currentUsername)}
          </React.Fragment>
        );
      case 'bold':
        return (
          <Text key={i} style={styles.bold}>
            {renderInlineNodes(node.children, memberUsernameSet, currentUsername)}
          </Text>
        );
      case 'italic':
        return (
          <Text key={i} style={styles.italic}>
            {renderInlineNodes(node.children, memberUsernameSet, currentUsername)}
          </Text>
        );
      case 'underline':
        return (
          <Text key={i} style={styles.underline}>
            {renderInlineNodes(node.children, memberUsernameSet, currentUsername)}
          </Text>
        );
      case 'strikethrough':
        return (
          <Text key={i} style={styles.strikethrough}>
            {renderInlineNodes(node.children, memberUsernameSet, currentUsername)}
          </Text>
        );
      case 'inlineCode':
        return (
          <Text key={i} style={styles.inlineCode}>
            {node.content}
          </Text>
        );
      case 'spoiler':
        return <SpoilerView key={i} index={i} content={node.content} />;
      case 'link':
        return (
          <Text
            key={i}
            style={styles.link}
            onPress={() => void Linking.openURL(node.url)}
          >
            {node.url}
          </Text>
        );
      default:
        return null;
    }
  });
}

// ── Mention-aware text leaf ──

function renderTextWithMentions(
  text: string,
  memberUsernameSet: Set<string>,
  currentUsername: string | undefined,
): React.ReactNode {
  const current = currentUsername?.toLowerCase();
  const segments = parseMentionSegments(text, memberUsernameSet, current);

  if (segments.length === 0) return text;

  return segments.map((seg, i) => {
    if (seg.kind === 'plain') {
      return <Text key={i}>{seg.text}</Text>;
    }
    return (
      <Text key={i} style={seg.isSelf ? styles.mentionSelf : styles.mentionHighlight}>
        {seg.display}
      </Text>
    );
  });
}

// ── Spoiler: tap-to-reveal ──

function SpoilerView({ index, content }: { index: number; content: string }): React.JSX.Element {
  const [revealed, setRevealed] = useState(false);

  const toggle = useCallback(() => {
    setRevealed((prev) => !prev);
  }, []);

  return (
    <Pressable onPress={toggle} testID={`spoiler-${index}`}>
      <Text style={revealed ? styles.spoilerRevealed : styles.spoilerHidden}>
        {content}
      </Text>
    </Pressable>
  );
}

// ── Code block ──

function CodeBlockView({ lang, content: code }: { lang: string; content: string }): React.JSX.Element {
  return (
    <View style={styles.codeBlock}>
      {lang ? <Text style={styles.codeBlockLang}>{lang}</Text> : null}
      <Text style={styles.codeBlockText}>{code}</Text>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  baseText: {
    ...typography.body,
    color: palette.text,
  },
  blockContainer: {
    // no extra spacing — messages already have padding from ChatPane row
  },
  // Inline formatting
  bold: {
    fontWeight: '700' as const,
  },
  italic: {
    fontStyle: 'italic' as const,
  },
  underline: {
    textDecorationLine: 'underline' as const,
  },
  strikethrough: {
    textDecorationLine: 'line-through' as const,
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    backgroundColor: palette.bgElevated,
    borderRadius: 4,
    paddingHorizontal: 4,
    color: palette.text,
  },
  link: {
    color: palette.accent,
    textDecorationLine: 'underline' as const,
  },
  // Spoiler
  spoilerHidden: {
    backgroundColor: palette.bgElevated,
    color: palette.bgElevated, // text invisible (same as background)
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  spoilerRevealed: {
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  // Code block
  codeBlock: {
    backgroundColor: palette.bgElevated,
    borderRadius: 6,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  codeBlockLang: {
    ...typography.caption,
    color: palette.textMuted,
    marginBottom: spacing.xs,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: palette.text,
  },
  // Blockquote
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: palette.accent,
    paddingLeft: spacing.sm,
    marginVertical: spacing.xs,
  },
  // Lists
  listContainer: {
    marginVertical: spacing.xs,
  },
  listItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 2,
  },
  listBullet: {
    ...typography.body,
    color: palette.textMuted,
  },
  // Mention highlighting — mirrors ChatPane styles exactly
  mentionHighlight: {
    backgroundColor: 'var(--hover)',
    color: palette.accent,
    borderRadius: 4,
    paddingHorizontal: 3,
    fontWeight: '600' as const,
  },
  mentionSelf: {
    backgroundColor: palette.accent,
    color: palette.text,
    borderRadius: 4,
    paddingHorizontal: 3,
    fontWeight: '600' as const,
  },
});
