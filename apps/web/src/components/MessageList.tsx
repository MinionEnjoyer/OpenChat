import { memo, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type { Message } from '../lib/types';
import { MessageRow } from './MessageRow';
import { OpenChatSpinner } from './OpenChatSpinner';
import type { ChannelScrollPosition } from '../lib/channelScroll';

export interface MessageListProps {
  messages: Message[];
  channelId: string | null;
  resumePosition?: ChannelScrollPosition | null;
  hasMore: boolean;
  hasNewer: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  conversationIntro?: ReactNode;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onReadPosition: (channelId: string, messageId: string) => void;
  onScrollPosition: (channelId: string, messageId: string, offset: number) => void;
  scrollCaptureRef: MutableRefObject<(() => void) | null>;
  meId: string;
  myUsername: string;
  shareBaseUrl: string;
  mentionNames: Set<string>;
  canDeleteAny: boolean;
  canPin: boolean;
  editingId: string | null;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  onReply: (m: Message) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onPin: (m: Message, pinned: boolean) => void;
  onDelete: (channelId: string, id: string) => void;
  onPollVote: (optionId: string) => void;
  onOpenReactionPicker: (messageId: string, anchor: { x: number; y: number }) => void;
}

/** The scrollable message list. Memoized so it repaints only when its own inputs
 *  change — not on every presence/typing/unread event flowing through the store. */
function MessageListInner(props: MessageListProps) {
  const {
    messages, meId, canDeleteAny, editingId, channelId, resumePosition,
    hasMore, hasNewer, loadingOlder, loadingNewer, onLoadOlder, onLoadNewer,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number | null>(null); // set right before older messages prepend
  const holdOnAppend = useRef(false);
  const prevChannel = useRef<string | null>(null);
  const restoredChannel = useRef<string | null>(null);
  const lastReported = useRef<{ channelId: string; messageId: string } | null>(null);
  const wasLoadingNewer = useRef(false);
  const followNewest = useRef(true);
  const lastScrollTop = useRef(0);
  const restoreFrames = useRef<number[]>([]);

  function scrollToNewest(el: HTMLDivElement) {
    el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
  }

  function cancelRestoreFrames() {
    for (const frame of restoreFrames.current) cancelAnimationFrame(frame);
    restoreFrames.current = [];
  }

  useLayoutEffect(() => () => {
    for (const frame of restoreFrames.current) cancelAnimationFrame(frame);
    restoreFrames.current = [];
  }, []);

  function visibleBounds() {
    const el = scrollRef.current;
    if (!el) return null;
    const viewport = el.getBoundingClientRect();
    const rows = el.querySelectorAll<HTMLElement>('[data-message-id]');
    let firstVisible: HTMLElement | null = null;
    let visibleId: string | null = null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.top < viewport.bottom - 8 && rect.bottom > viewport.top + 8) {
        if (!firstVisible) firstVisible = row;
        visibleId = row.dataset.messageId || null;
      }
    }
    return { viewport, firstVisible, visibleId };
  }

  function reportVisibleScrollPosition(targetChannelId: string | null = channelId) {
    if (!targetChannelId) return null;
    const visible = visibleBounds();
    if (!visible?.visibleId) return null;
    const firstId = visible.firstVisible?.dataset.messageId;
    if (visible.firstVisible && firstId) {
      props.onScrollPosition(
        targetChannelId,
        firstId,
        visible.firstVisible.getBoundingClientRect().top - visible.viewport.top,
      );
    }
    return visible.visibleId;
  }

  function reportVisibleReadPosition() {
    if (!channelId) return;
    const visibleId = reportVisibleScrollPosition(channelId);
    if (!visibleId) return;
    if (lastReported.current?.channelId === channelId && lastReported.current.messageId === visibleId) return;
    lastReported.current = { channelId, messageId: visibleId };
    props.onReadPosition(channelId, visibleId);
  }

  // App navigation invokes this before changing the active channel, while the old
  // rows and their exact pixel offsets are still mounted.
  useLayoutEffect(() => {
    const capture = () => reportVisibleScrollPosition(channelId);
    props.scrollCaptureRef.current = capture;
    return () => {
      if (props.scrollCaptureRef.current === capture) props.scrollCaptureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, props.scrollCaptureRef]);

  // Embeds can acquire their final height after the message page has rendered. Keep users
  // who were already at the newest edge pinned there; readers higher in history are left
  // untouched and retain their explicit saved anchor.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (restoredChannel.current === channelId && followNewest.current) {
        scrollToNewest(el);
      }
    });
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [channelId, messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // React can reset the shared scroller to the top while a channel's anchor page is
    // loading. Do not interpret that transient layout event as a request for older history.
    if (resumePosition === undefined || restoredChannel.current !== channelId) return;
    const scrolledUp = el.scrollTop < lastScrollTop.current - 1;
    const distanceFromNewest = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Pagination may prefetch within 120px of an edge, but bottom-follow represents
    // user intent. Any upward movement releases it immediately; it is re-enabled only
    // when the reader deliberately returns to the actual newest edge.
    if (scrolledUp) followNewest.current = false;
    else if (distanceFromNewest <= 16) followNewest.current = true;
    lastScrollTop.current = el.scrollTop;
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadOlder();
    } else if (!scrolledUp && distanceFromNewest < 120 && hasNewer && !loadingNewer) {
      holdOnAppend.current = true;
      onLoadNewer();
    }
    reportVisibleReadPosition();
  }

  // Restore the shared last-read marker at the lower edge (so opening a channel does
  // not silently advance it), hold position when either history direction is loaded,
  // and follow live messages only when already at the newest edge.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newerRequestFinished = wasLoadingNewer.current && !loadingNewer;
    wasLoadingNewer.current = loadingNewer;
    if (prevChannel.current !== channelId) {
      cancelRestoreFrames();
      prevChannel.current = channelId;
      restoredChannel.current = null;
      lastReported.current = null;
      prevScrollHeight.current = null;
      holdOnAppend.current = false;
      followNewest.current = true;
      lastScrollTop.current = el.scrollTop;
    }
    // A same-channel revisit can briefly render with the previous visit's resolved anchor
    // before the fresh request state commits. Treat every loading sentinel as a hard reset;
    // otherwise that stale render marks the channel restored and the real anchor is ignored.
    if (resumePosition === undefined) {
      restoredChannel.current = null;
      return;
    }
    if (restoredChannel.current !== channelId) {
      // null means there is no marker and the normal newest-message position should be used.
      const target = resumePosition?.messageId
        ? el.querySelector<HTMLElement>(`[data-message-id="${resumePosition.messageId}"]`)
        : null;
      // The resume state can resolve one render before the matching message page is
      // committed. Do not mark the channel restored at the newest edge in that gap:
      // doing so makes the later anchor row permanently ineffective.
      if (resumePosition?.messageId && !target) return;
      if (target) {
        const alignTarget = () => {
          const viewport = el.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          if (resumePosition && resumePosition.updatedAt > 0) {
            el.scrollTop += rect.top - viewport.top - resumePosition.offset;
          } else {
            el.scrollTop += rect.bottom - viewport.bottom + 16;
          }
          lastScrollTop.current = el.scrollTop;
        };
        // content-visibility can replace intrinsic row sizes during the next paint.
        // Re-align over two frames so rows materializing above the anchor cannot move it.
        cancelRestoreFrames();
        alignTarget();
        const firstFrame = requestAnimationFrame(() => {
          alignTarget();
          const secondFrame = requestAnimationFrame(() => {
            alignTarget();
            restoreFrames.current = [];
            followNewest.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
            reportVisibleReadPosition();
          });
          restoreFrames.current = [secondFrame];
        });
        restoreFrames.current = [firstFrame];
      } else {
        followNewest.current = true;
        scrollToNewest(el);
      }
      restoredChannel.current = channelId;
      if (!target) requestAnimationFrame(reportVisibleReadPosition);
      return;
    }
    if (prevScrollHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
      lastScrollTop.current = el.scrollTop;
      prevScrollHeight.current = null;
      return;
    }
    if (holdOnAppend.current && newerRequestFinished) {
      holdOnAppend.current = false;
      followNewest.current = false;
      return;
    }
    if (followNewest.current) scrollToNewest(el);
    requestAnimationFrame(reportVisibleReadPosition);
  }, [messages, channelId, resumePosition, loadingNewer]);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="msg-scroll"
      data-resume-anchor={resumePosition === undefined ? 'loading' : (resumePosition?.messageId ?? 'newest')}
      style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loadingOlder && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted-2)', fontSize: 12, padding: 4 }}>
          <OpenChatSpinner size={22} label="Loading older messages" />
          Loading older messages…
        </div>
      )}
      {props.conversationIntro}
      {messages.length === 0 && <div style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>No messages yet.</div>}
      {messages.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          meId={meId}
          myUsername={props.myUsername}
          shareBaseUrl={props.shareBaseUrl}
          mentionNames={props.mentionNames}
          isEditing={editingId === m.id}
          canDelete={m.kind === 'USER' && (m.authorId === meId || canDeleteAny)}
          canPin={m.kind === 'USER' && props.canPin}
          onToggleReaction={props.onToggleReaction}
          onReply={props.onReply}
          onStartEdit={props.onStartEdit}
          onSaveEdit={props.onSaveEdit}
          onCancelEdit={props.onCancelEdit}
          onPin={props.onPin}
          onDelete={props.onDelete}
          onPollVote={props.onPollVote}
          onOpenReactionPicker={props.onOpenReactionPicker}
        />
      ))}
      {loadingNewer && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted-2)', fontSize: 12, padding: 4 }}>
          <OpenChatSpinner size={22} label="Loading newer messages" />
          Loading newer messages…
        </div>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListInner);
