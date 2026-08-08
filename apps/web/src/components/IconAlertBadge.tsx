import type { CSSProperties, ReactNode } from 'react';

export const ICON_ALERT_Z_INDEX = 3;

export function IconAlertBadge({ children, className = '', style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`icon-alert-badge${className ? ` ${className}` : ''}`}
      style={{ position: 'absolute', zIndex: ICON_ALERT_Z_INDEX, pointerEvents: 'none', ...style }}
    >
      {children}
    </span>
  );
}
