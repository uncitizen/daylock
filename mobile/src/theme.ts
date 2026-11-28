/**
 * Daylock Design System
 * Matching the web app's visual design
 */

export const colors = {
  // Core colors
  ink: '#1a1f1c',
  paper: '#f3f0e8',
  paper2: '#e8e4d9',
  line: '#c9c3b4',
  muted: '#5c635c',
  
  // Accent colors
  accent: '#2f6f4e',
  accentSoft: '#d5e8dc',
  
  // Status colors
  hard: '#b45309',
  hardSoft: '#fde68a',
  locked: '#1e3a5f',
  lockedSoft: '#dbe7f3',
  danger: '#9f1239',
  ok: '#166534',
};

export const fonts = {
  // Display font for headers (serif)
  display: 'Georgia', // On iOS; Android uses 'serif'
  // Body font for regular text (sans-serif)
  body: 'System', // Uses system font
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const borderRadius = {
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '600' as const,
    fontFamily: fonts.display,
    color: colors.ink,
  },
  h2: {
    fontSize: 20,
    fontWeight: '600' as const,
    fontFamily: fonts.display,
    color: colors.ink,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: colors.ink,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: colors.muted,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
};
