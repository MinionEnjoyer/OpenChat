// @satisfies FR-MSG-013
import {
  extractYouTubeId,
  extractShareRef,
  isDirectImageUrl,
  classifyUrl,
  classifyEmbeds,
  extractUrls,
  isSingleEmbedUrl,
} from '../embeds';
describe('extractYouTubeId', () => {
  // @satisfies FR-MSG-013
  it('extracts from youtube.com/watch', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('extracts from youtu.be', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('extracts from youtube.com/embed', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('extracts from youtube.com/shorts', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('extracts from youtube.com/v', () => {
    expect(extractYouTubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('extracts from youtube-nocookie.com', () => {
    expect(extractYouTubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('returns null for non-YouTube URLs', () => {
    expect(extractYouTubeId('https://example.com')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
  });
});

describe('extractShareRef', () => {
  const shareHost = 'share.example.com';

  // @satisfies FR-MSG-013
  it('detects share image URL', () => {
    const ref = extractShareRef('https://share.example.com/i/abc123', shareHost);
    expect(ref).not.toBeNull();
    expect(ref!.kind).toBe('i');
    expect(ref!.id).toBe('abc123');
    expect(ref!.base).toBe('https://share.example.com');
  });

  // @satisfies FR-MSG-013
  it('detects share video URL', () => {
    const ref = extractShareRef('https://share.example.com/v/xyz789', shareHost);
    expect(ref).not.toBeNull();
    expect(ref!.kind).toBe('v');
    expect(ref!.id).toBe('xyz789');
  });

  // @satisfies FR-MSG-013
  it('detects share raw URL', () => {
    const ref = extractShareRef('https://share.example.com/raw/def456', shareHost);
    expect(ref).not.toBeNull();
    expect(ref!.kind).toBe('raw');
    expect(ref!.id).toBe('def456');
  });

  // @satisfies FR-MSG-013
  it('returns null for non-share URLs', () => {
    expect(extractShareRef('https://example.com/i/abc', shareHost)).toBeNull();
    expect(extractShareRef('https://share.other.com/i/abc', shareHost)).toBeNull();
  });

  // @satisfies FR-MSG-013
  it('returns null when shareHost is empty', () => {
    expect(extractShareRef('https://share.example.com/i/abc', '')).toBeNull();
  });
});

describe('isDirectImageUrl', () => {
  // @satisfies FR-MSG-013
  it('detects direct image URLs by extension', () => {
    expect(isDirectImageUrl('https://example.com/photo.jpg')).toBe(true);
    expect(isDirectImageUrl('https://example.com/photo.png')).toBe(true);
    expect(isDirectImageUrl('https://example.com/photo.gif')).toBe(true);
    expect(isDirectImageUrl('https://example.com/photo.webp')).toBe(true);
  });

  // @satisfies FR-MSG-013
  it('detects Giphy URLs', () => {
    expect(isDirectImageUrl('https://media.giphy.com/media/abc123/giphy.gif')).toBe(true);
    expect(isDirectImageUrl('https://media.giphy.com/media/abc123/giphy.mp4')).toBe(true);
  });

  // @satisfies FR-MSG-013
  it('returns false for non-image URLs', () => {
    expect(isDirectImageUrl('https://example.com/page')).toBe(false);
    expect(isDirectImageUrl('https://example.com/page.html')).toBe(false);
  });
});

describe('classifyUrl', () => {
  // @satisfies FR-MSG-013
  it('classifies YouTube URL as youtube card', () => {
    const card = classifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('youtube');
    expect((card as any).videoId).toBe('dQw4w9WgXcQ');
  });

  // @satisfies FR-MSG-013
  it('classifies share image URL as share-image card', () => {
    const card = classifyUrl('https://share.example.com/i/abc123', 'share.example.com');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('share-image');
    expect((card as any).rawUrl).toBe('https://share.example.com/raw/abc123');
  });

  // @satisfies FR-MSG-013
  it('classifies share video URL as share-video card', () => {
    const card = classifyUrl('https://share.example.com/v/abc123', 'share.example.com');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('share-video');
  });

  // @satisfies FR-MSG-013
  it('classifies generic URL as link card', () => {
    const card = classifyUrl('https://example.com/page', '');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('link');
    expect((card as any).hostname).toBe('example.com');
  });

  // @satisfies FR-MSG-013
  it('classifies direct image URL as gif card', () => {
    const card = classifyUrl('https://example.com/photo.jpg', '');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('gif');
    expect((card as any).isVideo).toBe(false);
  });

  // @satisfies FR-MSG-013
  it('classifies giphy .mp4 URL as gif with isVideo=true', () => {
    const card = classifyUrl('https://media.giphy.com/media/abc123/giphy.mp4', '');
    expect(card).not.toBeNull();
    expect(card!.type).toBe('gif');
    expect((card as any).isVideo).toBe(true);
  });
});

describe('classifyEmbeds', () => {
  // @satisfies FR-MSG-013
  it('returns all embeddable URLs as cards', () => {
    const content =
      'Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ and https://example.com';
    const cards = classifyEmbeds(content, '');
    expect(cards.length).toBe(2);
    expect(cards[0]!.type).toBe('youtube');
    expect(cards[1]!.type).toBe('link');
  });

  // @satisfies FR-MSG-013
  it('returns empty array for no-URL message', () => {
    expect(classifyEmbeds('Hello world', '')).toEqual([]);
    expect(classifyEmbeds('', '')).toEqual([]);
  });

  // @satisfies FR-MSG-013
  it('deduplicates URLs (max 4)', () => {
    const content = 'https://example.com https://example.com';
    const cards = classifyEmbeds(content, '');
    expect(cards.length).toBe(1);
  });
});

describe('extractUrls', () => {
  // @satisfies FR-MSG-013
  it('extracts all unique URLs from content', () => {
    const urls = extractUrls('https://a.com https://b.com https://a.com');
    expect(urls).toEqual(['https://a.com', 'https://b.com']);
  });

  // @satisfies FR-MSG-013
  it('caps at 4 URLs', () => {
    const urls = extractUrls('https://1.com https://2.com https://3.com https://4.com https://5.com');
    expect(urls.length).toBe(4);
  });

  // @satisfies FR-MSG-013
  it('returns empty for empty content', () => {
    expect(extractUrls('')).toEqual([]);
  });
});

describe('isSingleEmbedUrl', () => {
  // @satisfies FR-MSG-013
  it('returns true for a single YouTube URL', () => {
    expect(isSingleEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '')).toBe(true);
  });

  // @satisfies FR-MSG-013
  it('returns false for content with spaces', () => {
    expect(isSingleEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ text', '')).toBe(false);
  });

  // @satisfies FR-MSG-013
  it('returns false for non-embeddable URL', () => {
    expect(isSingleEmbedUrl('https://example.com', '')).toBe(false);
  });

  // @satisfies FR-MSG-013
  it('returns false for non-URL content', () => {
    expect(isSingleEmbedUrl('Hello world', '')).toBe(false);
  });

  // @satisfies FR-MSG-013
  it('returns true for a direct image URL', () => {
    expect(isSingleEmbedUrl('https://example.com/photo.jpg', '')).toBe(true);
  });

  // @satisfies FR-MSG-013
  it('returns true for a share URL', () => {
    expect(isSingleEmbedUrl('https://share.example.com/i/abc', 'share.example.com')).toBe(true);
  });
});
