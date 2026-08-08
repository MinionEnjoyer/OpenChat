import { useEffect, useRef, useState } from 'react';
import { uploadToShare } from '../lib/share';
import type { Attachment } from '../lib/types';
import { OpenChatSpinner } from './OpenChatSpinner';
import { SoundRecorder } from './SoundRecorder';

export type ChatTool = 'emoji' | 'gif' | 'sticker';

export function ChatOptionsTray({
  shareBaseUrl,
  serverId,
  active,
  onUploaded,
  onCreatePoll,
  onOpenTool,
}: {
  shareBaseUrl: string;
  serverId?: string | null;
  active?: boolean;
  onUploaded: (attachments: Attachment[]) => void;
  onCreatePoll: () => void;
  onOpenTool: (tool: ChatTool) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleFiles(files: File[]) {
    if (!files.length || !shareBaseUrl) return;
    setUploading(true);
    try {
      const { attachments, rejected } = await uploadToShare(files);
      if (rejected.length) alert('Rejected: ' + rejected.map((r) => `${r.name} (${r.reason})`).join(', '));
      if (attachments.length) onUploaded(attachments);
    } catch (error) {
      alert('Upload failed: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function openTool(tool: ChatTool) {
    setOpen(false);
    onOpenTool(tool);
  }

  const item = (label: string, icon: string, action: () => void) => (
    <button type="button" role="menuitem" className="chat-options-item" onClick={action}>
      <span className="chat-options-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="chat-options">
      <input ref={inputRef} type="file" multiple hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          handleFiles(files);
        }} />

      <button ref={triggerRef} type="button" className="chat-options-trigger"
        aria-label="Chat options" aria-haspopup="menu" aria-expanded={open}
        title="Chat options" disabled={uploading}
        data-active={open || active ? 'true' : 'false'}
        onClick={() => setOpen((value) => !value)}>
        {uploading ? <OpenChatSpinner size={18} label="Uploading attachment" /> : '＋'}
      </button>

      {open && (
        <>
          <div className="chat-options-backdrop" onClick={() => setOpen(false)} />
          <div className="chat-options-menu" role="menu" aria-label="Chat options">
            {shareBaseUrl && item('Upload a file', '📎', () => { setOpen(false); inputRef.current?.click(); })}
            {shareBaseUrl && item('Record a sound', '🎙', () => { setOpen(false); setRecording(true); })}
            {item('Create a poll', '▤', () => { setOpen(false); onCreatePoll(); })}
            {item('Choose a GIF', 'GIF', () => openTool('gif'))}
            {serverId && item('Choose a sticker', '◇', () => openTool('sticker'))}
            {item('Choose an emoji', '😊', () => openTool('emoji'))}
          </div>
        </>
      )}

      {recording && (
        <SoundRecorder
          onRecorded={(file) => handleFiles([file])}
          onClose={() => setRecording(false)} />
      )}
    </div>
  );
}
