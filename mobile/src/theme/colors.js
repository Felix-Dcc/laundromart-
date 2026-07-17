/**
 * Premium Glassmorphism Theme
 * Soft ambient lighting with refined neon accents
 */

export const colors = {
  // Dark background layers
  background: {
    primary: '#0a0a0f',      // Deep space black
    secondary: '#0f0f1a',      // Slightly lighter black
    tertiary: '#151520',     // Card background
  },

  // Soft ambient accent colors (refined, not gaming)
  ambient: {
    cyan: 'rgba(100, 200, 255, 0.4)',      // Soft cyan glow
    purple: 'rgba(168, 85, 247, 0.3)',   // Gentle purple
    blue: 'rgba(59, 130, 246, 0.35)',    // Soft blue
    accent: 'rgba(120, 200, 255, 0.5)',  // Primary accent
  },

  // Glassmorphism
  glass: {
    light: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(255, 255, 255, 0.12)',
    dark: 'rgba(0, 0, 0, 0.15)',
    border: 'rgba(255, 255, 255, 0.12)',
  },

  // Brand identity — the single source of truth for brand colour.
  // Mirrors app.config.js and scripts/brand/generate_icons.py, which render the
  // app icons from these same values. Change all three together.
  brand: {
    primary: '#1B7BF7',   // buttons, active states, notification accent
    bright: '#35A0FF',    // gradient start / highlights
    deep: '#0B4FD8',      // gradient end / splash backdrop
    water: '#7DD9FF',     // cyan accent used inside the mark
  },

  // Text colors
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.85)',
    tertiary: 'rgba(255, 255, 255, 0.65)',
    muted: 'rgba(255, 255, 255, 0.5)',
  },

  // Input states with soft glow
  input: {
    default: 'rgba(255, 255, 255, 0.06)',
    focused: 'rgba(100, 200, 255, 0.12)',
    border: 'rgba(255, 255, 255, 0.1)',
    borderFocused: 'rgba(120, 200, 255, 0.4)',
    glow: 'rgba(100, 200, 255, 0.15)',
  },

  // Error states
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#fca5a5',
  },
};

export default colors;
