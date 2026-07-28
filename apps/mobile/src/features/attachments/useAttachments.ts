/**
 * useAttachments — manages attachment selection, upload, compression, and tray state.
 *
 * FR-MED-010: photo library, camera, files; multi-select ≤10; upload progress;
 * cancel; client compression with "original" toggle.
 *
 * @satisfies FR-MED-010
 */
import { useCallback, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadAttachments } from './uploadService';
import { useSession } from '../../stores/session';
import { resolveConfig } from '../../lib/config';
import type { AttachmentItem, PendingFile, UploadedAttachment } from './types';
import { MAX_ATTACHMENTS } from './types';

const COMPRESS_MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.8;

export interface UseAttachmentsReturn {
  /** Current attachments in the tray. */
  attachments: AttachmentItem[];
  /** Whether an upload is in progress. */
  isUploading: boolean;
  /** Whether to send originals (skip compression). */
  sendOriginal: boolean;
  /** Toggle original/compressed. */
  setSendOriginal: (v: boolean) => void;
  /** Open photo library picker (multi-select). */
  pickFromLibrary: () => Promise<void>;
  /** Open camera. */
  pickFromCamera: () => Promise<void>;
  /** Open document picker. */
  pickFiles: () => Promise<void>;
  /** Remove an attachment by index. */
  removeAttachment: (index: number) => void;
  /** Upload all pending attachments. Returns uploaded refs. */
  uploadAll: () => Promise<UploadedAttachment[]>;
  /** Cancel any in-progress upload. */
  cancelUpload: () => void;
  /** Clear all attachments. */
  clear: () => void;
  /** Whether any attachments are in error state. */
  hasErrors: boolean;
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendOriginal, setSendOriginal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tokens = useSession((s) => s.tokens);

  const addFiles = useCallback(
    (files: PendingFile[]) => {
      setAttachments((prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        if (remaining <= 0) return prev;
        const toAdd = files.slice(0, remaining).map(
          (f): AttachmentItem => ({
            file: f,
            status: 'pending',
            progress: 0,
          }),
        );
        return [...prev, ...toAdd];
      });
    },
    [],
  );

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS,
      quality: 1, // We'll compress later
    });

    if (result.canceled || !result.assets) return;

    const files: PendingFile[] = result.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg',
      mimeType: a.mimeType ?? 'image/jpeg',
      size: a.fileSize ?? 0,
    }));
    addFiles(files);
  }, [addFiles]);

  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const a = result.assets[0];
    addFiles([
      {
        uri: a.uri,
        name: a.fileName ?? 'camera.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
        size: a.fileSize ?? 0,
      },
    ]);
  }, [addFiles]);

  const pickFiles = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: '*/*',
    });

    if (result.canceled || !result.assets) return;

    const files: PendingFile[] = result.assets.slice(0, MAX_ATTACHMENTS).map((a) => ({
      uri: a.uri,
      name: a.name,
      mimeType: a.mimeType ?? 'application/octet-stream',
      size: a.size ?? 0,
    }));
    addFiles(files);
  }, [addFiles]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    setSendOriginal(false);
  }, []);

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsUploading(false);
    setAttachments((prev) =>
      prev.map((a) =>
        a.status === 'uploading' ? { ...a, status: 'pending' as const, progress: 0 } : a,
      ),
    );
  }, []);

  const uploadAll = useCallback(async (): Promise<UploadedAttachment[]> => {
    const pending = attachments.filter((a) => a.status === 'pending');
    if (pending.length === 0) {
      return attachments
        .filter((a) => a.uploaded)
        .map((a) => a.uploaded!);
    }

    setIsUploading(true);
    const config = resolveConfig();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // Compress images if not sending originals
      const filesToUpload = await Promise.all(
        pending.map(async (a) => {
          if (!sendOriginal && a.file.mimeType.startsWith('image/') && !a.file.mimeType.includes('gif')) {
            try {
              const compressed = await ImageManipulator.manipulateAsync(
                a.file.uri,
                [{ resize: { width: COMPRESS_MAX_DIMENSION } }],
                { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
              );
              return {
                uri: compressed.uri,
                name: a.file.name.replace(/\.[^.]+$/, '.jpg'),
                mimeType: 'image/jpeg',
              };
            } catch {
              // Compression failed — send original
            }
          }
          return { uri: a.file.uri, name: a.file.name, mimeType: a.file.mimeType };
        }),
      );

      // Mark all as uploading
      setAttachments((prev) =>
        prev.map((a) =>
          a.status === 'pending' ? { ...a, status: 'uploading' as const, progress: 0 } : a,
        ),
      );

      const results = await uploadAttachments(
        filesToUpload,
        config.apiBaseUrl,
        tokens?.accessToken ?? '',
        {
          onProgress: (fileIndex, progress) => {
            const pct = progress.total > 0 ? progress.loaded / progress.total : 0;
            setAttachments((prev) => {
              const next = [...prev];
              // Find the n-th uploading item where n = fileIndex
              let count = 0;
              for (let i = 0; i < next.length; i++) {
                if (next[i]!.status === 'uploading') {
                  if (count === fileIndex) {
                    next[i] = { ...next[i]!, progress: pct };
                    break;
                  }
                  count++;
                }
              }
              return next;
            });
          },
          onFileComplete: (fileIndex, result) => {
            setAttachments((prev) => {
              const next = [...prev];
              let count = 0;
              for (let i = 0; i < next.length; i++) {
                if (next[i]!.status === 'uploading') {
                  if (count === fileIndex) {
                    next[i] = {
                      ...next[i]!,
                      status: 'done',
                      progress: 1,
                      uploaded: result,
                    };
                    break;
                  }
                  count++;
                }
              }
              return next;
            });
          },
        },
        abort.signal,
      );

      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (message !== 'Upload cancelled') {
        // Only mark as error if not user-cancelled
        setAttachments((prev) =>
          prev.map((a) =>
            a.status === 'uploading' ? { ...a, status: 'error' as const, error: message } : a,
          ),
        );
      }
      throw err;
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [attachments, sendOriginal, tokens?.accessToken]);

  const hasErrors = attachments.some((a) => a.status === 'error');

  return {
    attachments,
    isUploading,
    sendOriginal,
    setSendOriginal,
    pickFromLibrary,
    pickFromCamera,
    pickFiles,
    removeAttachment,
    uploadAll,
    cancelUpload,
    clear,
    hasErrors,
  };
}
