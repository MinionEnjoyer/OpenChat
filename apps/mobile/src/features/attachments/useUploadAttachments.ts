/**
 * FR-MED-030 — Upload hook with client-side compression.
 *
 * Accepts selected image assets, compresses them (unless toggled to
 * "original"), and uploads via multipart to POST /api/uploads.
 *
 * @satisfies FR-MED-030
 */
import { useCallback, useState } from 'react';
import { useSession } from '../../stores/session';
import { DEFAULT_DEV_CONFIG, resolveConfig } from '../../lib/config';
import { compressImage } from './imageCompression';
import { expoImageProcessor } from './expoImageProcessor';
import { useCompression } from './useCompression';
import type { CompressionToggle } from './useCompression';

export interface ImageAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
}

export interface UploadState {
  uploading: boolean;
  /** Count of files successfully uploaded so far. */
  uploaded: number;
  /** Total files selected. */
  total: number;
  error: string | null;
}

/** Returned attachment ref from POST /api/uploads, matching UploadedAttachment. */
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

export function useUploadAttachments(): {
  state: UploadState;
  toggle: CompressionToggle;
  upload: (assets: ImageAsset[]) => Promise<UploadedAttachment[]>;
  reset: () => void;
} {
  const tokens = useSession((s) => s.tokens);
  const toggle = useCompression();
  const [state, setState] = useState<UploadState>({
    uploading: false,
    uploaded: 0,
    total: 0,
    error: null,
  });

  const reset = useCallback(() => {
    toggle.resetAll();
    setState({ uploading: false, uploaded: 0, total: 0, error: null });
  }, [toggle]);

  const upload = useCallback(
    async (assets: ImageAsset[]): Promise<UploadedAttachment[]> => {
      setState({ uploading: true, uploaded: 0, total: assets.length, error: null });

      const results: UploadedAttachment[] = [];

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]!;

        // Compress (or pass through if original is toggled).
        const compressed = await compressImage(expoImageProcessor, {
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          original: toggle.isOriginal(asset.uri),
        });

        // Build FormData from the compressed (or original) file.
        const formData = new FormData();
        const fileName = asset.fileName ?? 'image.jpg';
        formData.append('files', {
          uri: compressed.uri,
          name: fileName,
          type: 'image/jpeg',
        } as unknown as Blob);

        try {
          const config = resolveConfig();
          const res = await fetch(`${config.apiBaseUrl}/uploads`, {
            method: 'POST',
            headers: tokens
              ? { authorization: `Bearer ${tokens.accessToken}` }
              : {},
            body: formData,
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Upload failed: ${res.status} ${text}`);
          }

          const uploaded: UploadedAttachment[] = await res.json();
          results.push(...uploaded);
          setState((s) => ({ ...s, uploaded: s.uploaded + 1 }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setState((s) => ({ ...s, error: msg }));
          throw err;
        }
      }

      setState((s) => ({ ...s, uploading: false }));
      return results;
    },
    [tokens, toggle],
  );

  return { state, toggle, upload, reset };
}
