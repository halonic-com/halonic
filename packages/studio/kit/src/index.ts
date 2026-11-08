/**
 * The Studio's shared kit: the design tokens and the base components. The tokens are CSS, not
 * TypeScript: import them from CSS with `@import "@halonicjs/studio-kit";` (see README.md). The
 * components arrive here one by one, each with its own named export.
 */

export { COPIED_FOR_MS, CopyButton, type CopyButtonProps } from "./copy-button/copy-button.tsx";
export { ExternalLink, type ExternalLinkProps } from "./external-link/external-link.tsx";
export {
  type ExternalAddress,
  type OpenExternal,
  OpenExternalProvider,
  type OpenExternalProviderProps,
  openInNewTab,
  useOpenExternal,
} from "./external-link/open-external.tsx";
export { SecretText } from "./secret-text/secret-text.ts";

/** The npm name of this package. */
export const packageName = "@halonicjs/studio-kit";

/**
 * Below this width (in CSS pixels) the Studio uses its phone layout, the same width as the
 * `phone:` variant in theme.css. For the shell's `matchMedia("(width < 600px)")`; a media query
 * can't read a CSS variable, so the number lives in both places and a test keeps them equal.
 */
export const PHONE_MAX_WIDTH = 600;
