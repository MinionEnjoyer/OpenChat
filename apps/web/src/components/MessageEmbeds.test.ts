import { describe, expect, it } from 'vitest';
import { messageYouTubeEmbedUrl, youTubeEmbedUrl, youTubeId } from './MessageEmbeds';

describe('YouTube message embeds', () => {
  it('recognizes supported YouTube URL shapes', () => {
    expect(youTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('identifies browser embeds with the page origin and referrer', () => {
    const src = new URL(youTubeEmbedUrl('dQw4w9WgXcQ', 'https://chat.example.com'));
    expect(src.origin + src.pathname).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(src.searchParams.get('origin')).toBe('https://chat.example.com');
    expect(src.searchParams.get('widget_referrer')).toBe('https://chat.example.com/');
  });

  it('routes native clients through the OpenChat HTTPS shim', () => {
    expect(messageYouTubeEmbedUrl('abc&123', true, 'https://chat.example.com'))
      .toBe('https://chat.example.com/yt.html?v=abc%26123');
    expect(messageYouTubeEmbedUrl('dQw4w9WgXcQ', false, 'https://chat.example.com', 'https://web.example.com'))
      .toContain('youtube.com/embed/dQw4w9WgXcQ');
  });
});
