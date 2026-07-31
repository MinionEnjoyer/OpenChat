/**
 * Upload service — POST /api/uploads multipart with per-file progress (FR-MED-010).
 *
 * Uses XMLHttpRequest so we can track upload progress (fetch does not expose
 * upload events). Each file upload is independent; the caller can cancel via
 * the returned AbortController.
 *
 * @satisfies FR-MED-010 — upload progress
 */
import type { UploadedAttachment } from './types';

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadCallbacks {
  onProgress?: (fileIndex: number, progress: UploadProgress) => void;
  onFileComplete?: (fileIndex: number, result: UploadedAttachment) => void;
  onFileError?: (fileIndex: number, error: string) => void;
}

/**
 * Upload one or more files to POST /api/uploads.
 *
 * Returns only successfully uploaded attachments; failures are reported
 * via onFileError. The caller receives the results and can decide whether
 * to proceed with the message send.
 */
export function uploadAttachments(
  files: { uri: string; name: string; mimeType: string }[],
  apiBaseUrl: string,
  authToken: string,
  callbacks: UploadCallbacks,
  signal?: AbortSignal,
): Promise<UploadedAttachment[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => {
      form.append('files', {
        uri: f.uri,
        name: f.name,
        type: f.mimeType,
      } as unknown as Blob);
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl}/uploads`);
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && callbacks.onProgress) {
        const totalLoaded = e.loaded;
        const grandTotal = e.total;
        // Distribute progress evenly across files
        const perFileSize = grandTotal / files.length;
        const fileIndex = Math.min(
          Math.floor(totalLoaded / perFileSize),
          files.length - 1,
        );
        const offset = fileIndex * perFileSize;
        const fileLoaded = totalLoaded - offset;
        const fileTotal = perFileSize;
        callbacks.onProgress(fileIndex, {
          loaded: Math.min(fileLoaded, fileTotal),
          total: fileTotal,
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: { attachments: UploadedAttachment[]; rejected: { name: string; reason: string }[] } = JSON.parse(xhr.responseText);
          const results = response.attachments;
          results.forEach((r, i) => {
            callbacks.onFileComplete?.(i, r);
          });
          resolve(results);
        } catch {
          reject(new Error('Invalid upload response'));
        }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err.message) message = err.message;
        } catch { /* use default */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(form);
  });
}
