/**
 * The starts of the messages a browser or Vite gives when a view's code can't be fetched: Chromium,
 * Firefox, Safari, then Vite's preload of the view's CSS. Narrow on purpose: any other error is a
 * bug, not a computer that can't be reached.
 */
const codeLoadMessages = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS for ",
] as const;

/**
 * Whether `error` says a view's code failed to load, not that the view broke
 * (`shell.code-load-failure`).
 *
 * @example
 * isCodeLoadFailure(new TypeError("Failed to fetch dynamically imported module: /assets/inbox-page.js")); // true
 */
export function isCodeLoadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return codeLoadMessages.some((start) => error.message.startsWith(start));
}
