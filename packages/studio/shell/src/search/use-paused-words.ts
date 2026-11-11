import { useEffect, useState } from "react";

/**
 * How long the Search page waits after the last key before it searches what is typed (design
 * search 3, T2 checklist 1.8): long enough not to ask the providers for every letter, short
 * enough that the results seem to follow the typing.
 */
export const searchPauseMs = 300;

/**
 * The words in a search box once the typing pauses: `typed` itself on mount, then each new
 * `typed` after {@link searchPauseMs} with no other change. A key pressed before the pause ends
 * starts it again, so only the words the user stopped on are searched.
 *
 * @example
 * const [typed, setTyped] = useState(words);
 * const searched = usePausedWords(typed);
 * const search = usePaletteSearch(searched, providers, contextFor);
 */
export function usePausedWords(typed: string): string {
  const [paused, setPaused] = useState(typed);

  useEffect(() => {
    const timer = setTimeout(() => setPaused(typed), searchPauseMs);
    return () => clearTimeout(timer);
  }, [typed]);

  return paused;
}
