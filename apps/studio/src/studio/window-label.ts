import { focusedAppIds } from "@halonicjs/studio-shell";

/**
 * The page's window label from Tauri's metadata, such as `main` or `inbox`, or `undefined` outside
 * the desktop shell. The shell gives the app page no query, so this is how a page knows its window.
 */
export function windowLabelOf(window: object): string | undefined {
  const label = path(window, ["__TAURI_INTERNALS__", "metadata", "currentWindow", "label"]);
  return typeof label === "string" ? label : undefined;
}

/** Whether the page is in a focused app's window, such as Halonic Inbox's, not Studio's. */
export function isFocusedAppWindow(window: object): boolean {
  const label = windowLabelOf(window);
  return label !== undefined && (focusedAppIds as readonly string[]).includes(label);
}

function path(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}
