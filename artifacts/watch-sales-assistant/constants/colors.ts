/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#172234',
    tint: '#bd9657',

    // Core surfaces
    background: '#f6f3ec',
    foreground: '#172234',

    // Cards / elevated surfaces
    card: '#fffdf8',
    cardForeground: '#172234',

    // Primary action color (buttons, links, active states)
    primary: '#bd9657',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#ebe6dc',
    secondaryForeground: '#172234',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#e8e2d8',
    mutedForeground: '#748092',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#dfe8ee',
    accentForeground: '#24465d',

    // Destructive actions (delete, error states)
    destructive: '#c65c52',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e5dfd4',
    input: '#d8d0c3',
  },
  dark: {
    text: '#f6f3ec',
    tint: '#d6ae6a',
    background: '#111c2b',
    foreground: '#f6f3ec',
    card: '#19283a',
    cardForeground: '#f6f3ec',
    primary: '#d0a45e',
    primaryForeground: '#111c2b',
    secondary: '#223349',
    secondaryForeground: '#f6f3ec',
    muted: '#223349',
    mutedForeground: '#9eabbc',
    accent: '#2d5266',
    accentForeground: '#e3f1f4',
    destructive: '#e17a6d',
    destructiveForeground: '#111c2b',
    border: '#2c3b50',
    input: '#34465d',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
