import React, { useState } from 'react';
import type { Attachment as AttachmentModel } from '../lib/types';
import { AudioPlayer } from './AudioPlayer';
import { Lightbox } from './Lightbox';

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
  const [zoomed, setZoomed] = useState(false);

  if (mimeType.startsWith('image/')) {
    return (
      <>
        <img
          src={url}
          alt={filename}
          loading="lazy"
          onClick={() => setZoomed(true)}
          style={{ maxWidth: '400px', maxHeight: '300px', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 4 }}
        />
        {zoomed && <Lightbox src={url} mimeType={mimeType} filename={filename} onClose={() => setZoomed(false)} />}
      </>
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '400px' }}>
          <video controls src={url} style={{ maxWidth: '400px', maxHeight: '300px', display: 'block', borderRadius: 4 }}>
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
        {zoomed && <Lightbox src={url} mimeType={mimeType} filename={filename} onClose={() => setZoomed(false)} />}
      </>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return <AudioPlayer src={url} filename={filename} peaksUrl={`${shareBaseUrl}/waveform/${shareAssetId}`} />;
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
        maxWidth: '300px'
      }}
    >
      {thumbnailUrl ? (
        <img 
          src={thumbnailUrl} 
          alt="" 
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
