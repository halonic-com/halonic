import { useEffect, useState } from "react";
import { useModalPolite } from "../dialog/modal-regions.tsx";

/** How long `doneLabel` stands in for the label, as CommandBox's check in a modal. */
export const DONE_LABEL_MS = 2000;

/** A button's label, and the call that swaps in its done label for a while. */
export interface DoneLabel {
  /** The label to show: `doneLabel` for {@link DONE_LABEL_MS} after {@link DoneLabel.show}, else `label`. */
  readonly label: string;
  /** Shows `doneLabel` and says it through the modal's polite region; does nothing without one. */
  readonly show: () => void;
}

/**
 * A ghost action's done label (`kit.callout-done-label`): `doneLabel` reads in place for
 * 2 seconds, and is said through the Dialog's or FormSheet's polite region, where toasts wait
 * until it closes. CalloutButton uses it, and so may a plain button that does the same job.
 */
export function useDoneLabel(label: string, doneLabel: string | undefined): DoneLabel {
  const modal = useModalPolite();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), DONE_LABEL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return {
    label: shown && doneLabel !== undefined ? doneLabel : label,
    show: () => {
      if (doneLabel === undefined) return;
      setShown(true);
      modal?.say(doneLabel);
    },
  };
}
