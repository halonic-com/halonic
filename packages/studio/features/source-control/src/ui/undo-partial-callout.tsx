import { Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { discardWords } from "../changes-words.ts";
import type { UndoItem } from "./use-undo-item.ts";

/**
 * The warning when **Undo these changes** failed and so did the roll-back (checklist part 2,
 * 2.5): the files not put back as they were, up to three then "and N more", with Try again, and
 * focus moves to it. Shows nothing otherwise.
 */
export function UndoPartialCallout({ undoing }: { readonly undoing: UndoItem }) {
  const callout = useRef<CalloutHandle>(null);
  const { partial } = undoing;
  useEffect(() => {
    if (partial !== undefined) callout.current?.focus();
  }, [partial]);
  if (partial === undefined) return null;
  return (
    <Callout
      ref={callout}
      announce="focus"
      tone="warning"
      title={discardWords.partialTitle(partial.item.name)}
      files={partial.paths}
      action={{
        label: discardWords.tryAgain,
        busyLabel: discardWords.tryAgainBusy,
        onClick: undoing.retry,
      }}
    >
      {discardWords.partialBody(partial.reason)}
    </Callout>
  );
}
