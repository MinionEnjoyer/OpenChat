import type { ReactNode } from 'react';

/**
 * Render message text into React nodes: hyperlinks for URLs and highlight spans
 * for valid @mentions (@everyone/@here or a known username). Pure — safe to memoize
 * per message keyed on (content, mentionNames, myUsername).
 */
export function renderMessageContent(text: string, mentionNames: Set<string>, myUsername: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<]+)|@([\w.-]+)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      // URL — trim trailing punctuation back out of the link.
      let url = m[1];
      const trail = url.match(/[.,!?;:)\]}'"]+$/)?.[0] ?? '';
      if (trail) url = url.slice(0, url.length - trail.length);
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {url}
        </a>,
      );
      if (trail) parts.push(trail);
      last = m.index + m[0].length;
    } else {
      const uname = m[2].toLowerCase();
      if (!(mentionNames.has(uname) || uname === 'everyone' || uname === 'here')) continue;
      if (m.index > last) parts.push(text.slice(last, m.index));
      const self = uname === myUsername.toLowerCase() || uname === 'everyone' || uname === 'here';
      parts.push(
        <span key={key++} style={{ background: self ? 'var(--accent)' : 'var(--hover)', color: self ? 'var(--accent-text)' : 'var(--accent)', borderRadius: 4, padding: '0 3px', fontWeight: 600 }}>
          @{m[2]}
        </span>,
      );
      last = m.index + m[0].length;
    }
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
