import type { Attachment } from './types';

export interface ShareConfig {
  shareBaseUrl: string;
  jellyfinUrl: string;
}

export async function getConfig(): Promise<ShareConfig> {
  const res = await fetch('/api/config', { credentials: 'include' });
  if (!res.ok) {
    const err = new Error(`config ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

interface UploadResponse {
  saved: { id: string; media_type: string; bundle?: boolean }[];
  rejected: { name: string; reason: string }[];
}

/**
 * Upload files directly to the Share service (the user is SSO'd to Share too, so the
 * browser's Share session cookie authorizes it). Returns Chat attachment references.
 */
export async function uploadToShare(
  files: File[],
  shareBaseUrl: string,
): Promise<{ attachments: Attachment[]; rejected: { name: string; reason: string }[] }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  form.append('source', 'chat'); // routes into the user's "Chat" folder on Share + enables dedup

  const res = await fetch(`${shareBaseUrl}/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Share upload failed (${res.status})`);
  const data: UploadResponse = await res.json();

  // Share returns accepted files (in order) under `saved` and skips rejected ones.
  const rejectedNames = new Set((data.rejected ?? []).map((r) => r.name));
  const accepted = files.filter((f) => !rejectedNames.has(f.name));

  const attachments: Attachment[] = data.saved.map((s, i) => {
    const file = accepted[i] ?? files[i];
    return {
      id: s.id,
      shareAssetId: s.id,
      filename: file?.name ?? s.id,
      mimeType: file?.type ?? '',
      size: String(file?.size ?? 0),
      url: `${shareBaseUrl}/raw/${s.id}`,
      thumbnailUrl: `${shareBaseUrl}/thumb/${s.id}`,
      width: null,
      height: null,
      durationMs: null,
    };
  });

  return { attachments, rejected: data.rejected ?? [] };
}

const VIEWER_PREFIX: Record<string, string> = {
  image: 'i',
  video: 'v',
  pdf: 'd',
  text: 't',
  model: 'm',
  archive: 'a',
};

export function viewerUrl(shareBaseUrl: string, mediaType: string, id: string): string {
  return `${shareBaseUrl}/${VIEWER_PREFIX[mediaType] ?? 'd'}/${id}`;
}
