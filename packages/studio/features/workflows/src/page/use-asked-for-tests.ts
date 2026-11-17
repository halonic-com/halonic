import { useState } from "react";

/**
 * Calls `onAsked` during the render in which an open page is asked for its Tests: `startOnTests`
 * turns true, or `testsAsked` (how many times the tab was asked) changes while it is true. Opening
 * already asked (the first render) is not a new ask.
 */
export function useAskedForTests(
  startOnTests: boolean | undefined,
  testsAsked: number,
  onAsked: () => void,
) {
  const ask = startOnTests ? testsAsked : undefined;
  const [seen, setSeen] = useState(ask);
  if (ask === seen) return;
  setSeen(ask);
  if (ask !== undefined) onAsked();
}
