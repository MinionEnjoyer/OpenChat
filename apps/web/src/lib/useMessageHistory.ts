import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { useAppStore } from './appStore';
import {
  getChannelScrollPosition,
  saveChannelScrollPosition,
  type ChannelScrollPosition,
} from './channelScroll';
import type { Message } from './types';

const PAGE_SIZE = 50;

export function useMessageHistory() {
  const [hasMoreByChannel, setHasMoreByChannel] = useState<Record<string, boolean>>({});
  const [hasNewerByChannel, setHasNewerByChannel] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [resumePositionByChannel, setResumePositionByChannel] = useState<
    Record<string, ChannelScrollPosition | null | undefined>
  >({});
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const readSaveTimers = useRef<Map<string, number>>(new Map());
  const activeScrollCaptureRef = useRef<(() => void) | null>(null);

  const beginChannelSelection = useCallback((channelId: string) => {
    activeScrollCaptureRef.current?.();
    setResumePositionByChannel((positions) => ({ ...positions, [channelId]: undefined }));
  }, []);

  const loadInitialPage = useCallback(async (channelId: string): Promise<boolean> => {
    const savedScroll = getChannelScrollPosition(channelId);
    let readMarkerId: string | null = null;
    let latestMessageId: string | null = null;
    try {
      const readState = await api.getReadState(channelId);
      readMarkerId = readState.lastReadMessageId;
      latestMessageId = readState.latestMessageId;
    } catch { /* latest page is a safe fallback */ }

    let resumeId = savedScroll?.messageId || readMarkerId;
    let resumeOffset = savedScroll?.messageId === resumeId ? savedScroll.offset : null;
    let messages: Message[];
    try {
      messages = await api.listMessages(channelId, resumeId ? { around: resumeId } : {});
    } catch {
      // A local viewport anchor can become stale when its message is deleted. Retry the
      // shared read marker before falling back to the newest page.
      resumeId = readMarkerId !== savedScroll?.messageId ? readMarkerId : null;
      resumeOffset = null;
      try {
        messages = await api.listMessages(channelId, resumeId ? { around: resumeId } : {});
      } catch {
        resumeId = null;
        messages = await api.listMessages(channelId);
      }
    }

    if (useAppStore.getState().activeChannelId !== channelId) return false;
    const containsResume = !!resumeId && messages.some((message) => message.id === resumeId);
    setResumePositionByChannel((positions) => ({
      ...positions,
      [channelId]: containsResume
        ? { messageId: resumeId!, offset: resumeOffset ?? 0, updatedAt: savedScroll?.updatedAt ?? 0 }
        : null,
    }));
    setHasMoreByChannel((state) => ({ ...state, [channelId]: messages.length >= PAGE_SIZE }));
    setHasNewerByChannel((state) => ({
      ...state,
      [channelId]: containsResume
        && !!latestMessageId
        && !messages.some((message) => message.id === latestMessageId),
    }));
    useAppStore.getState().setMessages(channelId, messages.slice().reverse());
    return true;
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;
    const state = useAppStore.getState();
    const channelId = state.activeChannelId;
    if (!channelId) return;
    const current = state.messagesByChannel[channelId] || [];
    if (current.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await api.listMessages(channelId, { before: current[0].id });
      useAppStore.getState().prependMessages(channelId, older.slice().reverse());
      setHasMoreByChannel((values) => ({ ...values, [channelId]: older.length >= PAGE_SIZE }));
    } catch { /* retry on the next upper-edge visit */ }
    finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, []);

  const loadNewer = useCallback(async () => {
    if (loadingNewerRef.current) return;
    const state = useAppStore.getState();
    const channelId = state.activeChannelId;
    if (!channelId) return;
    const current = state.messagesByChannel[channelId] || [];
    if (current.length === 0) return;
    loadingNewerRef.current = true;
    setLoadingNewer(true);
    try {
      const newer = await api.listMessages(channelId, { after: current[current.length - 1].id });
      useAppStore.getState().appendMessages(channelId, newer.slice().reverse());
      setHasNewerByChannel((values) => ({ ...values, [channelId]: newer.length >= PAGE_SIZE }));
    } catch { /* retry on the next lower-edge visit */ }
    finally {
      loadingNewerRef.current = false;
      setLoadingNewer(false);
    }
  }, []);

  const saveReadPosition = useCallback((channelId: string, messageId: string) => {
    const pending = readSaveTimers.current.get(channelId);
    if (pending !== undefined) window.clearTimeout(pending);
    const timer = window.setTimeout(() => {
      readSaveTimers.current.delete(channelId);
      api.markRead(channelId, messageId).catch(() => {});
    }, 450);
    readSaveTimers.current.set(channelId, timer);
  }, []);

  const saveScrollPosition = useCallback((channelId: string, messageId: string, offset: number) => {
    saveChannelScrollPosition(channelId, messageId, offset);
  }, []);

  useEffect(() => () => {
    for (const timer of readSaveTimers.current.values()) window.clearTimeout(timer);
    readSaveTimers.current.clear();
  }, []);

  return {
    activeScrollCaptureRef,
    beginChannelSelection,
    hasMoreByChannel,
    hasNewerByChannel,
    loadInitialPage,
    loadingNewer,
    loadingOlder,
    loadNewer,
    loadOlder,
    resumePositionByChannel,
    saveReadPosition,
    saveScrollPosition,
  };
}
