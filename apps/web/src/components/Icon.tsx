/** Renders one of the app's PNG glyphs from /public/icons (settings, mute, disconnect, …). */
export function Icon({
  name,
  size = 18,
  alt = '',
  style,
}: {
  name: 'settings' | 'mute' | 'unmute' | 'disconnect' | 'friends' | 'notify' | 'leaveserver' | 'error' | 'pin' | 'watchparty';
  size?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={`/icons/${name}.png`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', ...style }}
    />
  );
}
