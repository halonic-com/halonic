import type { ShareChoice } from "@halonicjs/studio-feature-source-control/api";

/** The part of `Storage` that keeps one choice. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Create version's "Share with your team right away" for the workspace at `location`, kept in
 * `storage` (the window's) so it outlives the window. It starts off. Without storage, or when it
 * refuses, the choice is kept for this window only.
 *
 * @example
 * services.provide(ShareChoiceService, shareChoiceMemory(window.localStorage, location));
 */
export function shareChoiceMemory(
  storage: ChoiceStorage | undefined,
  location: string,
): ShareChoice {
  const key = `halonic.share-right-away:${location}`;
  let session: boolean | undefined;
  return {
    read: () => {
      if (session !== undefined) return session;
      try {
        return storage?.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    write: (shareRightAway) => {
      session = shareRightAway;
      try {
        storage?.setItem(key, shareRightAway ? "1" : "0");
      } catch {
        // Kept for this window only.
      }
    },
  };
}
