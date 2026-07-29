# E-01: Markdown renderer — web vs FR-MSG-007 gap

**Date:** 2026-07-25
**Author:** Codewhale (P2-07 work order)
**Status:** Unresolved — proceeding per work order's Definition of Done

## Finding

The web client (`apps/web/src/App.tsx`, `renderContent` at line 752) has NO markdown
parsing. It handles exactly two things:

1. URL detection → clickable `<a>` links
2. `@mention` detection → highlighted `<span>`

All other text is rendered as-is inside a `<p>` with `whiteSpace: 'pre-wrap'`.

There is no bold, italic, underline, strikethrough, inline code, fenced code blocks,
spoilers, blockquotes, or lists. The web `package.json` has zero markdown dependencies.

## Conflict

- FR-MSG-007 lists 10+ markdown constructs and says "matches web client semantics"
- The web client implements none of them
- The arch spec (06 §1) says "simple-markdown-based custom renderer (same parser
  family as web/Discord)" — but web uses no such thing

"Matches web client semantics" would literally pass with a parser that only handles
URLs and mentions. The FR construct list would not.

## Decision (this work order)

The work order's Definition of Done explicitly lists every construct to parse. I am
proceeding with a full AST-producing parser covering all listed constructs, using
Discord-flavored syntax (since web has no dialect to match). This diverges from web
behavior and should be reconciled — either web gets markdown, or the FR is trimmed.

## Affected

- `apps/mobile/src/domain/markdown.ts` — full markdown AST parser
- `specs/01-REQUIREMENTS.md` FR-MSG-007 — acceptance criterion "matches web client
  semantics" is not currently verifiable against the reference implementation
- `specs/06-ARCH-APP.md` §1 Markdown row — claims web uses simple-markdown; false
