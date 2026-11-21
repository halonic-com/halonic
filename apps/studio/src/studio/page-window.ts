/** Calls `listener` whenever the page's window comes to the front; returns a function that stops it. */
export function focusOf(window: object, listener: () => void): () => void {
  if (!(window instanceof EventTarget)) return () => {};
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}

/** The window's local storage, or `undefined` when it has none or won't give it. */
export function storageOf(window: object): Storage | undefined {
  try {
    return "localStorage" in window ? (window.localStorage as Storage) : undefined;
  } catch {
    return undefined;
  }
}
