import { useRef, useState } from 'react';
import { uploadToShare } from '../lib/share';
import type { Attachment } from '../lib/types';
import { SoundRecorder } from './SoundRecorder';

/**
 * Attach button with a File / Recording menu, plus drag-and-drop + clipboard-paste.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);

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
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={uploading}
          title="Attach a file or record a sound (or drag & drop / paste)"
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

        {menuOpen && (
          <>
            {/* Outside-click catcher */}
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 41,
                background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 6px 24px rgba(0,0,0,0.35)', overflow: 'hidden', minWidth: 160,
              }}
            >
              {([
                ['📁  File', () => inputRef.current?.click()],
                ['🎙  Recording', () => setRecording(true)],
              ] as const).map(([lbl, act]) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => { setMenuOpen(false); act(); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 14,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {recording && (
        <SoundRecorder shareBaseUrl={shareBaseUrl} onRecorded={(file) => handleFiles([file])} onClose={() => setRecording(false)} />
      )}
    </div>
  );
}
