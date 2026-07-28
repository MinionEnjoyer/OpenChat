// FR-MSG-013 — Message embed card renderer
// Renders embed cards below message content when URLs are detected.
// Mirrors apps/web/src/components/MessageEmbeds.tsx render logic.
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import type { EmbedCard } from '../../domain/embeds';

type MI = React.ComponentProps<typeof MaterialIcons>['name'];

interface Props {
  cards: EmbedCard[];
}

export function MessageEmbeds({ cards }: Props): React.JSX.Element | null {
  if (cards.length === 0) return null;

  return (
    <View style={styles.container}>
      {cards.map((card, i) => (
        <EmbedCardView key={`${card.type}-${i}`} card={card} />
      ))}
    </View>
  );
}

function EmbedCardView({ card }: { card: EmbedCard }): React.JSX.Element {
  switch (card.type) {
    case 'youtube':
      return <YouTubeEmbed card={card} />;
    case 'gif':
      return <GifEmbed card={card} />;
    case 'share-image':
      return <ShareImageEmbed card={card} />;
    case 'share-video':
      return <ShareVideoEmbed card={card} />;
    case 'share-generic':
      return <ShareGenericEmbed card={card} />;
    case 'link':
      return <LinkEmbed card={card} />;
  }
}

function YouTubeEmbed({ card }: { card: Extract<EmbedCard, { type: 'youtube' }> }): React.JSX.Element {
  const thumb = `https://i.ytimg.com/vi/${card.videoId}/hqdefault.jpg`;
  const watchUrl = `https://www.youtube.com/watch?v=${card.videoId}`;
  return (
    <Pressable
      style={styles.card}
      onPress={() => void Linking.openURL(watchUrl)}
      accessibilityRole="link"
      accessibilityLabel={`${strings.embeds.youtubeTitle}: ${card.videoId}`}
    >
      <Image source={{ uri: thumb }} style={styles.ytThumb} resizeMode="cover" />
      <View style={styles.ytOverlay}>
        <Text style={styles.ytPlay}>{strings.embeds.youtubePlay}</Text>
      </View>
      <Text style={styles.cardLabel}>{strings.embeds.youtubeTitle}</Text>
    </Pressable>
  );
}

function GifEmbed({ card }: { card: Extract<EmbedCard, { type: 'gif' }> }): React.JSX.Element {
  return (
    <Image
      source={{ uri: card.url }}
      style={styles.gifImage}
      resizeMode="contain"
      accessibilityLabel="GIF"
    />
  );
}

function ShareImageEmbed({ card }: { card: Extract<EmbedCard, { type: 'share-image' }> }): React.JSX.Element {
  return (
    <Pressable onPress={() => void Linking.openURL(card.url)} accessibilityRole="link">
      <Image source={{ uri: card.rawUrl }} style={styles.shareImage} resizeMode="contain" />
    </Pressable>
  );
}

function ShareVideoEmbed({ card }: { card: Extract<EmbedCard, { type: 'share-video' }> }): React.JSX.Element {
  // React Native doesn't easily embed remote video without expo-av.
  // Fall back to a link card with thumbnail if available.
  return (
    <LinkEmbed card={{ type: 'link', url: card.url, hostname: card.shareId }} />
  );
}

function ShareGenericEmbed({ card }: { card: Extract<EmbedCard, { type: 'share-generic' }> }): React.JSX.Element {
  return (
    <Pressable
      style={styles.linkRow}
      onPress={() => void Linking.openURL(card.url)}
      accessibilityRole="link"
    >
      <Image source={{ uri: card.thumbUrl }} style={styles.linkThumb} />
      <Text style={styles.linkLabel} numberOfLines={1}>
        {card.host}{strings.embeds.shareSeparator}{card.kind}{strings.embeds.shareSeparator}{card.shareId}
      </Text>
    </Pressable>
  );
}

function LinkEmbed({ card }: { card: Extract<EmbedCard, { type: 'link' }> }): React.JSX.Element {
  return (
    <Pressable
      style={styles.linkRow}
      onPress={() => void Linking.openURL(card.url)}
      accessibilityRole="link"
      accessibilityLabel={`${strings.embeds.openLink}: ${card.url}`}
    >
      <View style={styles.linkIconWrap}>
        <MaterialIcons name={strings.embeds.linkIcon as MI} size={20} color={palette.textMuted} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={styles.linkLabel} numberOfLines={1}>
          {card.hostname}
        </Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {card.url}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 6, gap: 8 },
  card: {
    maxWidth: 480,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.bgElevated,
    borderWidth: 1,
    borderColor: palette.bgElevated,
  },
  // YouTube
  ytThumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  ytOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ytPlay: { color: '#fff', fontSize: 32, opacity: 0.8 },
  cardLabel: {
    ...typography.caption,
    color: palette.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  // GIF
  gifImage: { maxWidth: 320, maxHeight: 320, borderRadius: 8 },
  // Share image
  shareImage: { maxWidth: 400, maxHeight: 300, borderRadius: 8 },
  // Link card
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.sm,
    maxWidth: 360,
    borderWidth: 1,
    borderColor: palette.bgElevated,
    borderRadius: 8,
    backgroundColor: palette.bgElevated,
  },
  linkThumb: { width: 48, height: 48, borderRadius: 4, backgroundColor: palette.bg },
  linkIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: palette.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkIcon: { fontSize: 20 },
  linkTextWrap: { flex: 1 },
  linkLabel: {
    ...typography.caption,
    color: palette.textMuted,
    overflow: 'hidden',
  },
  linkUrl: {
    ...typography.caption,
    color: palette.textMuted,
    fontSize: 11,
    overflow: 'hidden',
  },
});
