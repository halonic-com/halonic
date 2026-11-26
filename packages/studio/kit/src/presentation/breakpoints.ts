/**
 * Below this width (in CSS pixels) the Studio uses its phone layout, the same width as the
 * `phone:` variant in theme-utilities.css. For the shell's `matchMedia("(width < 600px)")`; a
 * media query can't read a CSS variable, so the number lives in both places and a test keeps them
 * equal.
 */
export const PHONE_MAX_WIDTH = 600;

/**
 * From this width (in CSS pixels) the desktop shows its full layout; between `PHONE_MAX_WIDTH`
 * and this it is the narrow window, with the sidebar as a drawer (component specs 24.4). The same
 * width as `--breakpoint-wide` in theme.css, kept equal by a test.
 */
export const WIDE_MIN_WIDTH = 900;
