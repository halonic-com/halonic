import { useState } from "react";

/**
 * Whether a picker of the page (the When card's Trigger, the Starts card's target) should take the
 * focus: true when the page is opened asking for it, and again each time `asked` changes to a
 * count. `onAsked` runs at that moment, so the page can show the view the picker is on.
 */
export function usePickerFocus(asked: number | undefined, onAsked: () => void) {
  const [focus, setFocus] = useState(asked !== undefined);
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    if (asked !== undefined) {
      setFocus(true);
      onAsked();
    }
  }
  return { focus, done: () => setFocus(false) };
}
