import type { Attachment } from './types';
import { apiBase, getToken } from './serverConfig';

export interface ShareConfig {
  shareBaseUrl: string;
  jellyfinUrl: string;
}

export async function getConfig(): Promise<ShareConfig> {
  const token = getToken();
  const res = await fetch(`${apiBase()}/config`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const err = new Error(`config ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Upload files through the API's authenticated upload endpoint, which stores them in Share
 * on the user's behalf using the shared service key + the user's SSO sub. This needs NO
 * Share session or account, so it works for users who have never opened OpenShare (the old
 * web path posted straight to Share with a browser cookie, which such users don't have).
 * Web authenticates with the session cookie; native clients send a bearer app token.
 * `shareBaseUrl` is unused now (the API builds the returned URLs) but kept for call sites.
 */
export async function uploadToShare(
  files: File[],
  shareBaseUrl?: string,
): Promise<{ attachments: Attachment[]; rejected: { name: string; reason: string }[] }> {
  void shareBaseUrl;
  const token = getToken();
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(`${apiBase()}/uploads`, {
    method: 'POST',
    body: form,
    // Native clients auth with the bearer token cross-origin — omit cookies so the request
    // doesn't require CORS credentials support. Web (no token) sends its same-origin cookie.
    credentials: token ? 'omit' : 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`Upload failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as { attachments: Attachment[]; rejected: { name: string; reason: string }[] };
}

/**
 * Compute a waveform (audio-level peaks, normalized 0..1) + duration for a clip WITHOUT
 * storing it — used by the recorder to bake the preview waveform right after recording.
 * Returns null on any failure (caller falls back to no waveform).
 */
export async function analyzeWaveform(
  file: File,
  shareBaseUrl: string,
): Promise<{ peaks: number[]; duration: number | null } | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${shareBaseUrl}/waveform`, { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.peaks) || !data.peaks.length) return null;
    return {
      peaks: data.peaks.map((p: number) => Math.max(0, Math.min(1, p / 100))),
      duration: typeof data.duration === 'number' ? data.duration : null,
    };
  } catch {
    return null;
  }
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
