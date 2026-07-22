import React from 'react';
import type { Attachment as AttachmentModel } from '../lib/types';
import { AudioPlayer } from './AudioPlayer';

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

  if (mimeType.startsWith('image/')) {
    return (
      <img 
        src={url} 
        alt={filename} 
        loading="lazy" 
        style={{ maxWidth: '400px', maxHeight: '300px', objectFit: 'contain' }} 
      />
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <video controls src={url} style={{ maxWidth: '400px', maxHeight: '300px' }}>
        Your browser does not support the video tag.
      </video>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return <AudioPlayer src={url} filename={filename} />;
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
