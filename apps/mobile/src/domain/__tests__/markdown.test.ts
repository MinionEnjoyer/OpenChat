// @satisfies FR-MSG-007
// Snapshot unit tests: one fixture per construct, matches web client semantics.
// See docs/escalations/E-01-markdown-web-parity.md for web parity gap.
import { parseMarkdown } from '../markdown';
import type { MarkdownNode } from '../markdown';

function p(input: string): MarkdownNode[] {
  return parseMarkdown(input);
}

// ── Bold ──

test('bold: **text**', () => {
  expect(p('**hello**')).toEqual([
    { type: 'bold', children: [{ type: 'text', content: 'hello' }] },
  ]);
});

test('bold: mid-sentence', () => {
  expect(p('a **bold** word')).toEqual([
    { type: 'text', content: 'a ' },
    { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
    { type: 'text', content: ' word' },
  ]);
});

// ── Italic ──

test('italic: *text*', () => {
  expect(p('*italic*')).toEqual([
    { type: 'italic', children: [{ type: 'text', content: 'italic' }] },
  ]);
});

test('italic: _text_', () => {
  expect(p('_also italic_')).toEqual([
    { type: 'italic', children: [{ type: 'text', content: 'also italic' }] },
  ]);
});

test('italic: mid-sentence with star', () => {
  expect(p('some *emphatic* text')).toEqual([
    { type: 'text', content: 'some ' },
    { type: 'italic', children: [{ type: 'text', content: 'emphatic' }] },
    { type: 'text', content: ' text' },
  ]);
});

// ── Underline ──

test('underline: __text__', () => {
  expect(p('__underlined__')).toEqual([
    { type: 'underline', children: [{ type: 'text', content: 'underlined' }] },
  ]);
});

test('underline: mid-sentence', () => {
  expect(p('get __ready__ now')).toEqual([
    { type: 'text', content: 'get ' },
    { type: 'underline', children: [{ type: 'text', content: 'ready' }] },
    { type: 'text', content: ' now' },
  ]);
});

// ── Strikethrough ──

test('strikethrough: ~~text~~', () => {
  expect(p('~~redacted~~')).toEqual([
    { type: 'strikethrough', children: [{ type: 'text', content: 'redacted' }] },
  ]);
});

test('strikethrough: mid-sentence', () => {
  expect(p('this is ~~wrong~~ right')).toEqual([
    { type: 'text', content: 'this is ' },
    { type: 'strikethrough', children: [{ type: 'text', content: 'wrong' }] },
    { type: 'text', content: ' right' },
  ]);
});

// ── Inline code ──

test('inline code: `text`', () => {
  expect(p('`const x = 1`')).toEqual([
    { type: 'inlineCode', content: 'const x = 1' },
  ]);
});

test('inline code: mid-sentence', () => {
  expect(p('use `map()` here')).toEqual([
    { type: 'text', content: 'use ' },
    { type: 'inlineCode', content: 'map()' },
    { type: 'text', content: ' here' },
  ]);
});

test('inline code: no formatting inside', () => {
  // Backtick content is literal — ** is not bold inside code
  expect(p('`**not bold**`')).toEqual([
    { type: 'inlineCode', content: '**not bold**' },
  ]);
});

// ── Fenced code block ──

test('code block: fenced', () => {
  expect(p('```\nline1\nline2\n```')).toEqual([
    { type: 'codeBlock', lang: '', content: 'line1\nline2' },
  ]);
});

test('code block: with language', () => {
  expect(p('```ts\nconst x = 1;\n```')).toEqual([
    { type: 'codeBlock', lang: 'ts', content: 'const x = 1;' },
  ]);
});

test('code block: single line', () => {
  expect(p('```\nhello\n```')).toEqual([
    { type: 'codeBlock', lang: '', content: 'hello' },
  ]);
});

// ── Spoiler ──

test('spoiler: ||text||', () => {
  expect(p('||surprise||')).toEqual([
    { type: 'spoiler', content: 'surprise' },
  ]);
});

test('spoiler: mid-sentence', () => {
  expect(p('the answer is ||42|| obviously')).toEqual([
    { type: 'text', content: 'the answer is ' },
    { type: 'spoiler', content: '42' },
    { type: 'text', content: ' obviously' },
  ]);
});

test('spoiler: no formatting inside', () => {
  // Spoiler content is literal
  expect(p('||**not bold**||')).toEqual([
    { type: 'spoiler', content: '**not bold**' },
  ]);
});

// ── Blockquote ──

test('blockquote: single line', () => {
  expect(p('> quoted text')).toEqual([
    {
      type: 'blockquote',
      children: [{ type: 'text', content: 'quoted text' }],
    },
  ]);
});

test('blockquote: multi-line', () => {
  expect(p('> line one\n> line two')).toEqual([
    {
      type: 'blockquote',
      children: [
        { type: 'text', content: 'line one' },
        { type: 'text', content: 'line two' },
      ],
    },
  ]);
});

test('blockquote: empty input', () => {
  expect(p('> ')).toEqual([
    { type: 'blockquote', children: [] },
  ]);
});

// ── Links (autolinked URLs) ──

test('link: bare URL', () => {
  expect(p('https://example.com')).toEqual([
    { type: 'link', url: 'https://example.com' },
  ]);
});

test('link: URL mid-sentence', () => {
  expect(p('see https://example.com now')).toEqual([
    { type: 'text', content: 'see ' },
    { type: 'link', url: 'https://example.com' },
    { type: 'text', content: ' now' },
  ]);
});

test('link: trailing punctuation stripped (matching web)', () => {
  // Web strips .,!?;:)]}'" from URL end
  expect(p('https://example.com.')).toEqual([
    { type: 'link', url: 'https://example.com' },
    { type: 'text', content: '.' },
  ]);
});

test('link: multiple URLs', () => {
  expect(p('a https://a.com b https://b.com c')).toEqual([
    { type: 'text', content: 'a ' },
    { type: 'link', url: 'https://a.com' },
    { type: 'text', content: ' b ' },
    { type: 'link', url: 'https://b.com' },
    { type: 'text', content: ' c' },
  ]);
});

// ── Ordered list ──

test('ordered list', () => {
  expect(p('1. first\n2. second\n3. third')).toEqual([
    {
      type: 'orderedList',
      start: 1,
      items: [
        { type: 'listItem', children: [{ type: 'text', content: 'first' }] },
        { type: 'listItem', children: [{ type: 'text', content: 'second' }] },
        { type: 'listItem', children: [{ type: 'text', content: 'third' }] },
      ],
    },
  ]);
});

test('ordered list: non-1 start', () => {
  expect(p('5. fifth\n6. sixth')).toEqual([
    {
      type: 'orderedList',
      start: 5,
      items: [
        { type: 'listItem', children: [{ type: 'text', content: 'fifth' }] },
        { type: 'listItem', children: [{ type: 'text', content: 'sixth' }] },
      ],
    },
  ]);
});

// ── Unordered list ──

test('unordered list: dash', () => {
  expect(p('- item1\n- item2')).toEqual([
    {
      type: 'unorderedList',
      items: [
        { type: 'listItem', children: [{ type: 'text', content: 'item1' }] },
        { type: 'listItem', children: [{ type: 'text', content: 'item2' }] },
      ],
    },
  ]);
});

test('unordered list: star', () => {
  expect(p('* item1\n* item2')).toEqual([
    {
      type: 'unorderedList',
      items: [
        { type: 'listItem', children: [{ type: 'text', content: 'item1' }] },
        { type: 'listItem', children: [{ type: 'text', content: 'item2' }] },
      ],
    },
  ]);
});

test('unordered list: single item', () => {
  expect(p('- only')).toEqual([
    {
      type: 'unorderedList',
      items: [{ type: 'listItem', children: [{ type: 'text', content: 'only' }] }],
    },
  ]);
});

// ── Nesting ──

test('nesting: bold containing italic', () => {
  expect(p('***bold italic***')).toEqual([
    {
      type: 'bold',
      children: [
        { type: 'italic', children: [{ type: 'text', content: 'bold italic' }] },
      ],
    },
  ]);
});

test('nesting: underline containing italic', () => {
  expect(p('___under italic___')).toEqual([
    {
      type: 'underline',
      children: [
        { type: 'italic', children: [{ type: 'text', content: 'under italic' }] },
      ],
    },
  ]);
});

test('nesting: bold containing code', () => {
  expect(p('**bold `code`**')).toEqual([
    {
      type: 'bold',
      children: [
        { type: 'text', content: 'bold ' },
        { type: 'inlineCode', content: 'code' },
      ],
    },
  ]);
});

test('nesting: italic containing strikethrough', () => {
  expect(p('*italic ~~strike~~*')).toEqual([
    {
      type: 'italic',
      children: [
        { type: 'text', content: 'italic ' },
        { type: 'strikethrough', children: [{ type: 'text', content: 'strike' }] },
      ],
    },
  ]);
});

// ── Malformed / edge cases ──

test('malformed: unclosed bold', () => {
  // Must not throw
  expect(() => p('**unclosed')).not.toThrow();
  // Unclosed **: delimiter chars become separate text nodes
  expect(p('**unclosed')).toEqual([
    { type: 'text', content: '**' },
    { type: 'text', content: 'unclosed' },
  ]);
});

test('malformed: unclosed italic', () => {
  expect(() => p('*unclosed')).not.toThrow();
  expect(p('*unclosed')).toEqual([
    { type: 'text', content: '*' },
    { type: 'text', content: 'unclosed' },
  ]);
});

test('malformed: unclosed inline code', () => {
  expect(() => p('`unclosed')).not.toThrow();
  expect(p('`unclosed')).toEqual([
    { type: 'text', content: '`' },
    { type: 'text', content: 'unclosed' },
  ]);
});

test('malformed: unclosed spoiler', () => {
  expect(() => p('||unclosed')).not.toThrow();
  expect(p('||unclosed')).toEqual([
    { type: 'text', content: '||' },
    { type: 'text', content: 'unclosed' },
  ]);
});

test('malformed: unclosed code block (EOF)', () => {
  expect(() => p('```\ncode here')).not.toThrow();
  expect(p('```\ncode here')).toEqual([
    { type: 'codeBlock', lang: '', content: 'code here' },
  ]);
});

test('malformed: empty input', () => {
  expect(p('')).toEqual([]);
});

test('malformed: whitespace only', () => {
  expect(p('   \n  \n ')).toEqual([]);
});

test('edge: double asterisk not bold (no closing)', () => {
  // A single ** with no matching close is literal
  expect(p('a ** b')).toEqual([
    { type: 'text', content: 'a ' },
    { type: 'text', content: '**' },
    { type: 'text', content: ' b' },
  ]);
});

test('edge: escaped content is literal', () => {
  // Backslash-escaped formatting characters: \X → literal X
  expect(p('\\*not italic\\*')).toEqual([
    { type: 'text', content: '*' },
    { type: 'text', content: 'not italic' },
    { type: 'text', content: '*' },
  ]);
});

test('edge: bold with URL inside', () => {
  expect(p('**see https://example.com**')).toEqual([
    {
      type: 'bold',
      children: [
        { type: 'text', content: 'see ' },
        { type: 'link', url: 'https://example.com' },
      ],
    },
  ]);
});

test('edge: code block with blank line inside', () => {
  expect(p('```\nline1\n\nline3\n```')).toEqual([
    { type: 'codeBlock', lang: '', content: 'line1\n\nline3' },
  ]);
});

test('edge: three backticks mid-text are NOT a code block', () => {
  // Only at line start does ``` open a code block.
  // Backticks not forming inline code become literal text nodes.
  expect(p('text ``` code')).toEqual([
    { type: 'text', content: 'text ' },
    { type: 'text', content: '`' },
    { type: 'text', content: '`' },
    { type: 'text', content: '`' },
    { type: 'text', content: ' code' },
  ]);
});

test('edge: list with formatted items', () => {
  expect(p('- **bold** item\n- *italic* item')).toEqual([
    {
      type: 'unorderedList',
      items: [
        {
          type: 'listItem',
          children: [
            { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
            { type: 'text', content: ' item' },
          ],
        },
        {
          type: 'listItem',
          children: [
            { type: 'italic', children: [{ type: 'text', content: 'italic' }] },
            { type: 'text', content: ' item' },
          ],
        },
      ],
    },
  ]);
});
