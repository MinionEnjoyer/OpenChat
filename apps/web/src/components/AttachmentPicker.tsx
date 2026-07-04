import { useRef, useState } from 'react';
import { uploadToShare } from '../lib/share';
import type { Attachment } from '../lib/types';

/**
 * Attach button with file-picker + drag-and-drop + clipboard-paste support.
 * Uploads to the Share service and hands the resulting attachment refs to the parent.
 */
export function AttachmentPicker({
  shareBaseUrl,
  onUploaded,
}: {
  shareBaseUrl: string;
  onUploaded: (attachments: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const { attachments, rejected } = await uploadToShare(files, shareBaseUrl);
      if (rejected.length) {
        alert('Rejected: ' + rejected.map((r) => `${r.name} (${r.reason})`).join(', '));
      }
      if (attachments.length) onUploaded(attachments);
    } catch (e) {
      alert('Upload failed: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(Array.from(e.dataTransfer.files));
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) handleFiles(files);
      }}
      style={{ display: 'inline-block' }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; handleFiles(files); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Attach files (or drag & drop / paste)"
        style={{
          background: dragOver ? 'var(--accent)' : 'var(--hover)',
          color: 'var(--accent-text)',
          border: 'none',
          borderRadius: 4,
          padding: '6px 10px',
          cursor: uploading ? 'default' : 'pointer',
        }}
      >
        {uploading ? 'Uploading…' : '+ Attach'}
      </button>
    </div>
  );
}
