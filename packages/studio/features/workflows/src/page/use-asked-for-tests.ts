import { useState } from "react";

/**
 * Calls `onAsked` during the render in which an open page is asked for its Tests: `startOnTests`
 * turned true. Opening already asked (the first render) is not a new ask.
 */
export function useAskedForTests(startOnTests: boolean | undefined, onAsked: () => void) {
  const asked = startOnTests === true;
  const [seen, setSeen] = useState(asked);
  if (asked === seen) return;
  setSeen(asked);
  if (asked) onAsked();
}
