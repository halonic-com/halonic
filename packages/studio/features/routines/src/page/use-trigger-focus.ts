import { useState } from "react";

/**
 * Whether the Trigger picker should take the focus: true when the page is opened asking for it,
 * and again each time `triggerAsked` changes to a count. `onAsked` runs at that moment, so the
 * page can show the view the picker is on.
 */
export function useTriggerFocus(triggerAsked: number | undefined, onAsked: () => void) {
  const [focusTrigger, setFocusTrigger] = useState(triggerAsked !== undefined);
  const [seen, setSeen] = useState(triggerAsked);
  if (triggerAsked !== seen) {
    setSeen(triggerAsked);
    if (triggerAsked !== undefined) {
      setFocusTrigger(true);
      onAsked();
    }
  }
  return { focusTrigger, done: () => setFocusTrigger(false) };
}
