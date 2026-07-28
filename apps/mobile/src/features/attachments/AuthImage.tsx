// @satisfies FR-MED-011 — Authenticated image component
// Fetches attachment images through the auth'd media proxy using the bearer token,
// since React Native's Image component cannot set custom headers.
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { palette } from '../../ui/tokens';
import { useSession } from '../../stores/session';
import { resolveAttachmentUrl } from '../../domain/attachments';
import { getApiBaseUrl } from '../../lib/config';

interface Props {
  /** Relative proxy path, e.g. /api/media/{id}/raw or /api/media/{id}/thumb */
  path: string;
  /** Optional base URL override (defaults to resolved app config) */
  baseUrl?: string;
  /** Optional style overrides */
  style?: object;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Resize mode for the image */
  resizeMode?: 'cover' | 'contain' | 'stretch';
}

/**
 * Renders an image loaded through the authenticated media proxy.
 *
 * Fetches the image with the session bearer token, converts to a
 * base64 data URI, and renders via React Native's Image component.
 * Shows a placeholder background while loading.
 *
 * @satisfies FR-MED-011
 */
export function AuthImage({
  path,
  baseUrl,
  style,
  accessibilityLabel,
  resizeMode = 'cover',
}: Props): React.JSX.Element {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const resolvedBase = baseUrl ?? getApiBaseUrl();
        const url = resolveAttachmentUrl(resolvedBase, path);

        const tokens = useSession.getState().tokens as { accessToken: string } | null;
        if (!tokens?.accessToken) {
          if (!cancelled) setError(true);
          return;
        }

        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        if (!resp.ok) {
          if (!cancelled) setError(true);
          return;
        }

        const arrayBuffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const contentType =
          resp.headers.get('content-type') ?? 'image/jpeg';
        const data = `data:${contentType};base64,${btoa(binary)}`;

        if (!cancelled) setDataUri(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [path, baseUrl]);

  if (error) {
    return <View style={[styles.placeholder, style]} />;
  }

  if (!dataUri) {
    return <View style={[styles.placeholder, style]} />;
  }

  return (
    <Image
      source={{ uri: dataUri }}
      style={[styles.image, style]}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: palette.bgElevated,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
