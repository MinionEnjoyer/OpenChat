import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSession } from '../../stores/session';

/** Returned by the upload broker POST /uploads (P5-02). */
export interface UploadResult {
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: string; // BigInt serialized as decimal string by server
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

interface UseAvatarUploadReturn {
  pickAndUpload: () => Promise<UploadResult | null>;
  busy: boolean;
  error: string | null;
}

/**
 * Compute square crop origin and size from image dimensions.
 * Takes the smaller dimension; centers the crop.
 *
 * Exported for testing — a naive implementation that returns the full size
 * instead of square-cropping is a real bug.
 */
export function computeSquareCrop(w: number, h: number): {
  originX: number;
  originY: number;
  width: number;
  height: number;
} {
  const size = Math.min(w, h);
  return {
    originX: Math.floor((w - size) / 2),
    originY: Math.floor((h - size) / 2),
    width: size,
    height: size,
  };
}

/**
 * FR-MED-020 — Avatar / server-icon upload hook.
 *
 * Pipeline: image picker → square crop (ImageManipulator) → POST /uploads (multipart).
 * Returns the first UploadResult so callers can PATCH /auth/me or /servers/:id.
 *
 * @satisfies FR-MED-020
 */
export function useAvatarUpload(baseUrl: string): UseAvatarUploadReturn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokens = useSession((s) => s.tokens);
  const onHardLogout = useSession((s) => s.logout);

  const pickAndUpload = useCallback(async (): Promise<UploadResult | null> => {
    setError(null);
    setBusy(true);
    try {
      // 1. Pick image from library
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Permission to access media library was denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      if (!asset) return null;

      // 2. Square crop — take the smaller dimension to center-crop
      const crop = computeSquareCrop(asset.width, asset.height);

      const cropped = await manipulateAsync(
        asset.uri,
        [{ crop }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );

      // 3. Upload to broker
      const form = new FormData();
      const blob = {
        uri: cropped.uri,
        type: 'image/jpeg',
        name: 'avatar.jpg',
      } as unknown as Blob;
      form.append('files', blob);

      const resp = await fetch(`${baseUrl}/uploads`, {
        method: 'POST',
        headers: tokens
          ? { Authorization: `Bearer ${tokens.accessToken}` }
          : {},
        body: form,
      });

      if (resp.status === 401) {
        onHardLogout();
        setError('Session expired');
        return null;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        setError(`Upload failed (${resp.status}): ${text}`);
        return null;
      }

      const uploads: UploadResult[] = await resp.json();
      if (!uploads || uploads.length === 0) {
        setError('Upload returned no results');
        return null;
      }

      return uploads[0] ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      return null;
    } finally {
      setBusy(false);
    }
  }, [baseUrl, tokens, onHardLogout]);

  return { pickAndUpload, busy, error };
}
