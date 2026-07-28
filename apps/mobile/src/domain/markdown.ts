// FR-MSG-007 — Markdown AST parser
// Pure domain logic: zero React / React Native imports (06 §2).
// Syntax: Discord-flavored. See docs/escalations/E-01-markdown-web-parity.md
// for the web parity gap (web has no markdown parser at all).

// ── AST node types ──

export type InlineNode =
  | TextNode
  | BoldNode
  | ItalicNode
  | UnderlineNode
  | StrikethroughNode
  | InlineCodeNode
  | SpoilerNode
  | LinkNode;

export type MarkdownNode =
  | InlineNode
  | CodeBlockNode
  | BlockQuoteNode
  | OrderedListNode
  | UnorderedListNode;

export interface TextNode {
  type: 'text';
  content: string;
}

export interface BoldNode {
  type: 'bold';
  children: InlineNode[];
}

export interface ItalicNode {
  type: 'italic';
  children: InlineNode[];
}

export interface UnderlineNode {
  type: 'underline';
  children: InlineNode[];
}

export interface StrikethroughNode {
  type: 'strikethrough';
  children: InlineNode[];
}

export interface InlineCodeNode {
  type: 'inlineCode';
  content: string;
}

export interface CodeBlockNode {
  type: 'codeBlock';
  lang: string;
  content: string;
}

export interface SpoilerNode {
  type: 'spoiler';
  content: string;
}

export interface LinkNode {
  type: 'link';
  url: string;
}

export interface BlockQuoteNode {
  type: 'blockquote';
  children: MarkdownNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  start: number;
  items: ListItemNode[];
}

export interface UnorderedListNode {
  type: 'unorderedList';
  items: ListItemNode[];
}

export interface ListItemNode {
  type: 'listItem';
  children: InlineNode[];
}

// ── URL regex (matching web's URL detection) ──
// Source: apps/web/src/App.tsx line 755
const URL_RE = /(https?:\/\/[^\s<]+)/g;

// ── Inline parsing ──

/**
 * Parse inline markdown within a single line (no block constructs).
 * Single-pass character scanner — handles all inline constructs with proper nesting.
 */
function parseInline(text: string): InlineNode[] {
  const nodes = scanInline(text, 0, text.length);
  return linkify(nodes);
}

/**
 * Scan inline text from `start` (inclusive) to `end` (exclusive), producing InlineNode[].
 * Detects formatting boundaries left-to-right with correct precedence:
 *   code (`) > spoiler (||) > bold (**) > underline (__) > strikethrough (~~) > italic (* or _)
 * Code and spoiler are leaf nodes (no nested formatting inside).
 * Bold/underline/strikethrough/italic scan their content recursively within bounds.
 */
function scanInline(text: string, start: number, end: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = start;

  while (i < end) {
    const ch = text[i];

    // Backslash escape: \X → literal X
    if (ch === '\\' && i + 1 < end) {
      nodes.push({ type: 'text', content: text[i + 1] ?? '' });
      i += 2;
      continue;
    }

    // Inline code: `...` (must have content and not be part of ```)
    if (ch === '`' && i + 1 < end && text[i + 1] !== '`') {
      const close = findClosing(text, i + 1, end, '`');
      if (close !== -1 && close > i + 1) {
        nodes.push({ type: 'inlineCode', content: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
      // Unclosed or empty — treat as literal
      nodes.push({ type: 'text', content: '`' });
      i++;
      continue;
    }

    // Spoiler: ||...||
    if (ch === '|' && i + 1 < end && text[i + 1] === '|') {
      const close = findClosing(text, i + 2, end, '||');
      if (close !== -1) {
        nodes.push({ type: 'spoiler', content: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
      // Unclosed — treat as literal
      nodes.push({ type: 'text', content: '||' });
      i += 2;
      continue;
    }

    // Bold: **...** (two-char delimiter, checked before italic *)
    if (ch === '*' && i + 1 < end && text[i + 1] === '*' && (i === start || text[i - 1] !== '*')) {
      // If content starts with * (i.e. ***...), find the LAST closing **
      // so that ***bold italic*** → bold{italic{text}} (not bold{*text*}*)
      const nested = i + 2 < end && text[i + 2] === '*';
      const close = findClosing(text, i + 2, end, '**', nested);
      if (close !== -1) {
        const children = scanInline(text, i + 2, close);
        nodes.push({ type: 'bold', children });
        i = close + 2;
        continue;
      }
      // Unclosed bold — treat as literal
      nodes.push({ type: 'text', content: '**' });
      i += 2;
      continue;
    }

    // Underline: __...__
    if (ch === '_' && i + 1 < end && text[i + 1] === '_' && (i === start || text[i - 1] !== '_')) {
      // Same logic as bold: if content starts with _, find last closing __
      const nested = i + 2 < end && text[i + 2] === '_';
      const close = findClosing(text, i + 2, end, '__', nested);
      if (close !== -1) {
        const children = scanInline(text, i + 2, close);
        nodes.push({ type: 'underline', children });
        i = close + 2;
        continue;
      }
      nodes.push({ type: 'text', content: '__' });
      i += 2;
      continue;
    }

    // Strikethrough: ~~...~~
    if (ch === '~' && i + 1 < end && text[i + 1] === '~' && (i === start || text[i - 1] !== '~')) {
      const close = findClosing(text, i + 2, end, '~~');
      if (close !== -1) {
        const children = scanInline(text, i + 2, close);
        nodes.push({ type: 'strikethrough', children });
        i = close + 2;
        continue;
      }
      nodes.push({ type: 'text', content: '~~' });
      i += 2;
      continue;
    }

    // Italic: *...* (single, but not **)
    if (ch === '*' && (i + 1 >= end || text[i + 1] !== '*') && (i === start || text[i - 1] !== '*')) {
      const close = findClosing(text, i + 1, end, '*');
      if (close !== -1 && (close + 1 >= end || text[close + 1] !== '*')) {
        const children = scanInline(text, i + 1, close);
        nodes.push({ type: 'italic', children });
        i = close + 1;
        continue;
      }
      // Unclosed italic — treat as literal
      nodes.push({ type: 'text', content: '*' });
      i++;
      continue;
    }

    // Italic: _..._ (single, but not __)
    if (ch === '_' && (i + 1 >= end || text[i + 1] !== '_') && (i === start || text[i - 1] !== '_')) {
      const close = findClosing(text, i + 1, end, '_');
      if (close !== -1 && (close + 1 >= end || text[close + 1] !== '_')) {
        const children = scanInline(text, i + 1, close);
        nodes.push({ type: 'italic', children });
        i = close + 1;
        continue;
      }
      nodes.push({ type: 'text', content: '_' });
      i++;
      continue;
    }

    // Plain text — accumulate until next special char or end bound
    const textStart = i;
    i++;
    while (i < end && !isSpecial(text[i]!)) {
      i++;
    }
    nodes.push({ type: 'text', content: text.slice(textStart, i) });
  }

  return nodes;
}

/** Characters that may start a formatting span. */
function isSpecial(ch: string): boolean {
  return ch === '\\' || ch === '`' || ch === '|' || ch === '*' || ch === '_' || ch === '~';
}

/**
 * Find the closing delimiter in `text` between `from` (inclusive) and `end` (exclusive).
 * When `fromEnd` is true, searches right-to-left (used for nested ***...*** style patterns).
 * Returns the index of the first char of the closing delimiter, or -1 if not found.
 */
function findClosing(text: string, from: number, end: number, delim: string, fromEnd?: boolean): number {
  if (fromEnd && delim.length === 2) {
    // Search right-to-left for the last occurrence — handles ***...*** correctly
    for (let i = end - delim.length; i >= from; i--) {
      if (text.slice(i, i + delim.length) === delim) {
        return i;
      }
    }
    return -1;
  }
  for (let i = from; i <= end - delim.length; i++) {
    if (text.slice(i, i + delim.length) === delim) {
      // For single-char delimiters (*, _), ensure we don't match part of a double
      if (delim.length === 1) {
        if (delim === '*' && i + 1 < end && text[i + 1] === '*') continue;
        if (delim === '_' && i + 1 < end && text[i + 1] === '_') continue;
      }
      return i;
    }
  }
  return -1;
}

/**
 * Scan text nodes for URLs and replace them with link nodes.
 * Matches web behavior: URLs autolinked, trailing punctuation stripped.
 * Source: apps/web/src/App.tsx lines 755-771
 */
function linkify(nodes: InlineNode[]): InlineNode[] {
  const result: InlineNode[] = [];

  for (const node of nodes) {
    // Recurse into formatting nodes that have children
    if (
      node.type === 'bold' ||
      node.type === 'italic' ||
      node.type === 'underline' ||
      node.type === 'strikethrough'
    ) {
      result.push({ ...node, children: linkify(node.children) } as InlineNode);
      continue;
    }
    if (node.type !== 'text') {
      result.push(node);
      continue;
    }

    const text = node.content;
    let last = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(URL_RE.source, 'g');

    while ((m = re.exec(text)) !== null) {
      let url = m[1] ?? '';
      // Strip trailing punctuation (matching web behavior line 761)
      const trail = url.match(/[.,!?;:)\]}'"]+$/)?.[0] ?? '';
      if (trail) url = url.slice(0, url.length - trail.length);

      if (m.index > last) {
        result.push({ type: 'text', content: text.slice(last, m.index) });
      }
      result.push({ type: 'link', url });
      if (trail) {
        result.push({ type: 'text', content: trail });
      }
      last = m.index + m[0].length;
    }

    if (last < text.length) {
      result.push({ type: 'text', content: text.slice(last) });
    }
  }

  return result;
}

// ── Block-level parsing ──

/**
 * Parse a full markdown string into an AST.
 * Handles block-level constructs (code blocks, blockquotes, lists)
 * and delegates inline parsing to parseInline.
 */
export function parseMarkdown(input: string): MarkdownNode[] {
  if (!input) return [];

  const lines = input.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code block: ```lang ... ```
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      // Skip closing ```
      if (i < lines.length) i++;
      nodes.push({ type: 'codeBlock', lang, content: codeLines.join('\n') });
      continue;
    }

    // Blockquote: > text
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quoteLines.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      // Recursively parse the blockquote content
      const innerNodes = parseMarkdown(quoteLines.join('\n'));
      nodes.push({ type: 'blockquote', children: innerNodes });
      continue;
    }

    // Unordered list: - text or * text
    if (/^[-*]\s/.test(line)) {
      const items: ListItemNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i] ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^[-*]\s/, '');
        items.push({ type: 'listItem', children: parseInline(itemText) });
        i++;
      }
      nodes.push({ type: 'unorderedList', items });
      continue;
    }

    // Ordered list: N. text
    if (/^\d+\.\s/.test(line)) {
      const items: ListItemNode[] = [];
      const firstNum = parseInt((line.match(/^(\d+)\./) ?? ['', '1'])[1] ?? '1', 10);
      while (i < lines.length && /^\d+\.\s/.test(lines[i] ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^\d+\.\s/, '');
        items.push({ type: 'listItem', children: parseInline(itemText) });
        i++;
      }
      nodes.push({ type: 'orderedList', start: firstNum, items });
      continue;
    }

    // Empty line — skip
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Regular paragraph: inline content
    const inlineNodes = parseInline(line);
    // Flatten inline nodes into the top level
    nodes.push(...inlineNodes);
    i++;
  }

  return nodes;
}
