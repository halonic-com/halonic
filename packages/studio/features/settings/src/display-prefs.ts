/**
 * Where the `display` settings are kept: Appearance, Formats and Developer. They belong to this
 * computer (or this browser, when served) and every workspace, never to a workspace file
 * (req-settings, `settings.display-prefs`).
 *
 * Two adapters: browser storage (`BrowserDisplayPrefs`), and later the desktop app's profile,
 * which the app reads before the first paint so the theme doesn't flash. Never the desktop
 * webview's own storage: it is tied to the app ID, which moves.
 */
export interface DisplayPrefs {
  /** The value stored under `key`, or `undefined` when there is none or it can't be read. */
  read(key: string): unknown;
  /**
   * Stores a value that `JSON.stringify` keeps as it is.
   *
   * @throws when it can't be stored, such as when the storage is full or read-only; the promise
   *   rejects with the reason
   */
  write(key: string, value: unknown): Promise<void>;
  /**
   * Calls `listener` with the key when a value changes somewhere else, such as in another window.
   *
   * @returns a function that stops listening
   */
  subscribe(listener: (key: string) => void): () => void;
}

/**
 * One display setting: its key and how to read what was stored. A stored value that `read` doesn't
 * accept, such as the theme "sepia", silently gives `fallback`, with no error: there is no
 * "Reset to defaults", so a bad value must never get stuck.
 *
 * @example
 * const theme: DisplayPref<Theme> = {
 *   key: "appearance.theme",
 *   fallback: "system",
 *   read: (stored) => (themes.includes(stored as Theme) ? (stored as Theme) : undefined),
 * };
 */
export interface DisplayPref<Value> {
  readonly key: string;
  readonly fallback: Value;
  /** The setting's value from what was stored, or `undefined` when that isn't a good one. */
  read(stored: unknown): Value | undefined;
}
