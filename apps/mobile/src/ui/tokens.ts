/**
 * Design tokens (06 §5). Dark is the default theme; light and system follow in
 * FR-APP-004. No raw color literal may appear outside this file — lint enforces
 * it, so a theme change stays a one-file change.
 */

export const palette = {
  bg: '#313338',
  bgElevated: '#2b2d31',
  text: '#f2f3f5',
  textMuted: '#b5bac1',
  accent: '#5865f2',
  danger: '#da373c',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const tokens = { palette, spacing, typography } as const;
