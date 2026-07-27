import { isTauri } from './TitleBar';
import { serverOrigin } from '../lib/serverConfig';

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|v)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch { /* ignore */ }
  return null;
}

// The Share service host is configured per deployment (set once from the backend config),
// so embeds work for any instance instead of a hardcoded domain.
let shareHost = '';
export function setShareHost(shareBaseUrl: string): void {
  try { shareHost = shareBaseUrl ? new URL(shareBaseUrl).hostname : ''; }
  catch { shareHost = ''; }
}

function shareRef(url: string): { kind: string; id: string; base: string; host: string } | null {
  if (!shareHost) return null;
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h !== shareHost && !h.endsWith('.' + shareHost)) return null;
    const m = u.pathname.match(/^\/(i|v|d|t|m|a|raw|thumb)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return { kind: m[1], id: m[2], base: `${u.protocol}//${u.host}`, host: u.host };
  } catch { return null; }
}

// GIFs (giphy/tenor) and other direct image URLs
function directImage(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (/(^|\.)giphy\.com$/.test(host) || /(^|\.)tenor\.com$/.test(host) || host === 'media.tenor.com') {
      return /\.(gif|mp4|webp)$/i.test(u.pathname) || /giphy\.gif$/i.test(u.pathname) || u.pathname.includes('/media/');
    }
    return /\.(gif|png|jpe?g|webp|avif)$/i.test(u.pathname);
  } catch { return false; }
}

/** Does this content consist of a single URL that renders as an embed (used to hide the raw text)? */
export function isSingleEmbedUrl(content: string): boolean {
  const t = content.trim();
  if (!t || /\s/.test(t) || !/^https?:\/\//.test(t)) return false;
  return !!youTubeId(t) || !!shareRef(t) || directImage(t);
}

export function MessageEmbeds({ content }: { content: string }) {
  if (!content) return null;
  const urls = Array.from(new Set(content.match(URL_RE) ?? [])).slice(0, 4);
  const embeds: React.ReactNode[] = [];

  for (const url of urls) {
    const yt = youTubeId(url);
    if (yt) {
      // Native webviews (tauri://…) are rejected by YouTube's player, so nest the
      // player inside our own https shim page (valid referrer); web embeds directly.
      const src = isTauri() && serverOrigin()
        ? `${serverOrigin()}/yt.html?v=${yt}`
        : `https://www.youtube-nocookie.com/embed/${yt}`;
      embeds.push(
        <div key={`yt-${yt}`} style={{ maxWidth: 480, aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
          <iframe src={src} title="YouTube video"
            style={{ width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>,
      );
      continue;
    }
    if (directImage(url)) {
      if (/\.mp4$/i.test(url)) {
        embeds.push(<video key={`gif-${url}`} src={url} autoPlay loop muted playsInline style={{ maxWidth: 320, maxHeight: 320, borderRadius: 8 }} />);
      } else {
        embeds.push(<img key={`gif-${url}`} src={url} alt="" loading="lazy" style={{ maxWidth: 320, maxHeight: 320, borderRadius: 8, display: 'block' }} />);
      }
      continue;
    }
    const s = shareRef(url);
    if (s) {
      const raw = `${s.base}/raw/${s.id}`;
      const thumb = `${s.base}/thumb/${s.id}`;
      if (s.kind === 'i' || s.kind === 'raw') {
        embeds.push(
          <a key={`sh-${s.id}`} href={url} target="_blank" rel="noopener noreferrer">
            <img src={raw} alt="" style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8, display: 'block', objectFit: 'contain' }} />
          </a>,
        );
      } else if (s.kind === 'v') {
        embeds.push(<video key={`sh-${s.id}`} src={raw} controls style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8 }} />);
      } else {
        embeds.push(
          <a key={`sh-${s.id}`} href={url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, maxWidth: 360, border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
            <img src={thumb} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, background: 'var(--panel-dark)' }} />
            <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.host}/{s.kind}/{s.id}</span>
          </a>,
        );
      }
    }
  }

  if (embeds.length === 0) return null;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>{embeds}</div>;
}
