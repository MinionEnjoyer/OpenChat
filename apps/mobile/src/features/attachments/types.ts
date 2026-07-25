/**
 * Attachment types — shared between the upload service, hook, and UI.
 *
 * @satisfies FR-MED-010 — attachment state model
 */

/** An attachment ref returned by POST /api/uploads, matching web Attachment shape. */
export interface UploadedAttachment {
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** A locally selected file pending upload. */
export interface PendingFile {
  /** Local file URI (from image picker or document picker). */
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/** State of one attachment in the tray. */
export interface AttachmentItem {
  /** Local file info. */
  file: PendingFile;
  /** Upload status. */
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** 0–1 progress (only when uploading). */
  progress: number;
  /** Error message (only when status === 'error'). */
  error?: string;
  /** Server response after successful upload. */
  uploaded?: UploadedAttachment;
}

/** Maximum files per message (FR-MED-010). */
export const MAX_ATTACHMENTS = 10;

/** Maximum file size in MB (per-file, matching API's 100 MB default). */
export const MAX_FILE_SIZE_MB = 100;
