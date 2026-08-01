import React, { useState } from 'react';
import type { Attachment as AttachmentModel } from '../lib/types';
import { AudioPlayer } from './AudioPlayer';
import { Lightbox } from './Lightbox';
import { SpinnerImage } from './SpinnerImage';
import { mediaUrl } from '../lib/serverConfig';

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getViewerPrefix = (mimeType: string): string => {
  if (mimeType.startsWith('pdf')) return '/d';
  if (mimeType.startsWith('text/')) return '/t';
  if (mimeType.startsWith('model/') || mimeType === 'application/octet-stream') {
    // Heuristic for 3D models based on common types or extension logic if available, 
    // but here we rely on mime type primarily. The prompt specifies model/* -> /m.
    return '/m';
  }
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
    return '/a';
  }
  // Default fallback for documents not covered above
  return '/d';
};

export const Attachment: React.FC<{ attachment: AttachmentModel; shareBaseUrl: string }> = ({
  attachment, 
  shareBaseUrl 
}) => {
  const { mimeType, filename, size, url, thumbnailUrl, shareAssetId } = attachment;
  const assetUrl = mediaUrl(url);
  const assetThumbnailUrl = thumbnailUrl ? mediaUrl(thumbnailUrl) : null;
  const [zoomed, setZoomed] = useState(false);

  if (mimeType.startsWith('image/')) {
    return (
      <>
        <SpinnerImage
          className="message-media"
          src={assetUrl}
          alt={filename}
          loading="lazy"
          spinnerSize={32}
          wrapperStyle={{ maxWidth: '400px', minWidth: 96, minHeight: 72 }}
          onClick={() => setZoomed(true)}
          style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 4 }}
        />
        {zoomed && <Lightbox src={assetUrl} mimeType={mimeType} filename={filename} onClose={() => setZoomed(false)} />}
      </>
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <>
        <div className="message-media-wrap" style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <video className="message-media" controls src={assetUrl} style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: 4 }}>
            Your browser does not support the video tag.
          </video>
          <button
            onClick={() => setZoomed(true)}
            title="Enlarge"
            style={{ position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ⛶
          </button>
        </div>
        {zoomed && <Lightbox src={assetUrl} mimeType={mimeType} filename={filename} onClose={() => setZoomed(false)} />}
      </>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return <AudioPlayer src={assetUrl} filename={filename} peaksUrl={`${shareBaseUrl}/waveform/${shareAssetId}`} />;
  }

  // File card for other types
  const viewerPrefix = getViewerPrefix(mimeType);
  const viewerUrl = `${shareBaseUrl}${viewerPrefix}/${shareAssetId}`;

  return (
    <a 
      href={viewerUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        textDecoration: 'none',
        color: 'inherit',
        maxWidth: '100%'
      }}
    >
      {assetThumbnailUrl ? (
        <SpinnerImage
          src={assetThumbnailUrl}
          alt=""
          spinnerSize={18}
          wrapperStyle={{ width: 48, height: 48, minWidth: 48, minHeight: 48 }}
          style={{ width: '48px', height: '48px', objectFit: 'cover' }} 
        />
      ) : (
        <div style={{ width: '48px', height: '48px', backgroundColor: 'var(--panel-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          📄
        </div>
      )}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {filename}
        </div>
        <div style={{ fontSize: '0.8em', color: 'var(--muted-2)' }}>
          {formatSize(Number(size))}
        </div>
      </div>
    </a>
  );
};
