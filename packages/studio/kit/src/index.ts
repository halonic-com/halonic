/**
 * The Studio's shared kit. For now it holds only the design tokens, which are CSS, not
 * TypeScript: import them from CSS with `@import "@halonicjs/studio-kit";` (see README.md). The
 * base components arrive here one by one, each with its own named export.
 */

/** The npm name of this package. A placeholder export until the first component lands. */
export const packageName = "@halonicjs/studio-kit";

/**
 * Below this width (in CSS pixels) the Studio uses its phone layout, the same width as the
 * `phone:` variant in theme.css. For the shell's `matchMedia("(width < 600px)")`; a media query
 * can't read a CSS variable, so the number lives in both places and a test keeps them equal.
 */
export const PHONE_MAX_WIDTH = 600;
