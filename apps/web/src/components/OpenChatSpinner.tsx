import type { CSSProperties } from 'react';

type SpinnerStyle = CSSProperties & {
  '--oc-spinner-size'?: string;
  '--oc-glow-offset'?: string;
  '--oc-glow-radius'?: string;
};

export function OpenChatSpinner({
  size = 104,
  label = 'Loading',
  className = '',
  style,
}: {
  size?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const glowOffset = size <= 24 ? 0.5 : size <= 48 ? 1 : 2;
  const glowRadius = size <= 24 ? 4 : size <= 48 ? 6 : 10;
  const spinnerStyle: SpinnerStyle = {
    '--oc-spinner-size': `${size}px`,
    '--oc-glow-offset': `${glowOffset}px`,
    '--oc-glow-radius': `${glowRadius}px`,
    ...style,
  };

  return (
    <span
      className={`oc-spinner${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={label}
      style={spinnerStyle}
    />
  );
}
