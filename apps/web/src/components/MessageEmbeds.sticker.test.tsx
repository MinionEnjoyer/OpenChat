import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageEmbeds, isSingleEmbedUrl } from './MessageEmbeds';

describe('sticker message rendering', () => {
  it('renders a sticker payload as an image instead of literal message text', () => {
    const content = 'sticker::/api/media/asset_123/raw';
    const { container } = render(<MessageEmbeds content={content} />);

    expect(isSingleEmbedUrl(content)).toBe(true);
    expect(screen.getByAltText('sticker')).toHaveAttribute('src', '/api/media/asset_123/raw');
    expect(container).not.toHaveTextContent(content);
  });
});
