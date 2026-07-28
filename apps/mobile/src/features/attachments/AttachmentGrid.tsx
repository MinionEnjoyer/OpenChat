// @satisfies FR-MED-011 — Image attachment grid renderer
// Renders a Discord-style image grid: 1 image full-width, 2 side-by-side,
// 3 with one large + two stacked smaller, 4+ in a 2-column grid.
// Tapping an image opens the fullscreen gallery modal.
import { useState, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { palette } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import {
  filterImageAttachments,
  computeImageGrid,
} from '../../domain/attachments';
import type { Attachment } from '../../api/schema';
import { AuthImage } from './AuthImage';
import { GalleryModal } from './GalleryModal';

interface Props {
  attachments: Attachment[];
  /** Optional API base URL override (defaults to resolved config) */
  apiBaseUrl?: string;
}

/**
 * Renders image attachments in a Discord-style grid layout.
 * Tapping an image opens the fullscreen gallery.
 *
 * Non-image attachments are silently ignored (they get rendered
 * elsewhere by their respective components).
 *
 * @satisfies FR-MED-011
 */
export function AttachmentGrid({ attachments, apiBaseUrl }: Props): React.JSX.Element | null {
  const images = useMemo(() => filterImageAttachments(attachments), [attachments]);
  const grid = useMemo(() => computeImageGrid(images), [images]);

  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const openGallery = useCallback(
    (index: number) => {
      setGalleryIndex(index);
      setGalleryVisible(true);
    },
    [],
  );

  const closeGallery = useCallback(() => setGalleryVisible(false), []);

  if (grid.count === 0) return null;

  // Build flat index to know which image in the full list each grid item maps to
  let flatIdx = 0;

  return (
    <View style={styles.container} accessibilityLabel={strings.attachments.imageGrid}>
      {grid.rows.map((row, rowIdx) => (
        <View key={`row-${rowIdx}`} style={styles.row}>
          {row.map((item) => {
            const idx = flatIdx++;
            return (
              <Pressable
                key={item.attachment.id}
                style={[styles.cell, { flex: item.flex, height: item.height }]}
                onPress={() => openGallery(idx)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${strings.attachments.imageLabel} ${idx + 1}`}
                testID={`attach-grid-image-${idx}`}
              >
                <AuthImage
                  path={item.attachment.thumbnailUrl ?? item.attachment.url}
                  baseUrl={apiBaseUrl}
                  style={styles.cellImage}
                  accessibilityLabel={`${strings.attachments.imageLabel} ${idx + 1}`}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
      {galleryVisible && (
        <GalleryModal
          images={images}
          initialIndex={galleryIndex}
          apiBaseUrl={apiBaseUrl}
          onClose={closeGallery}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    gap: 3,
    maxWidth: 400,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  cell: {
    overflow: 'hidden',
    backgroundColor: palette.bgElevated,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
});
