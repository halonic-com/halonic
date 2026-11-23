import { useEffect, useState } from "react";
import { noTryItChanges, type TryItChanges, tryItChangesSentences } from "./try-it-changes.ts";

/**
 * Watches one item's changes to review for Try it: calls `listener` with them now and on each
 * change, and returns the way to stop.
 */
export type WatchTryItChanges = (listener: (changes: TryItChanges) => void) => () => void;

/** The props of {@link TryItChangesLine}. */
export interface TryItChangesLineProps {
  /** Absent where the host has no changes to review (the browser demo): no line shows. */
  readonly watch?: WatchTryItChanges | undefined;
}

/**
 * The line at the top of the Try it panel and the workflow's tests (flow-assistant 4.4): that
 * Try it uses the assistant's changes you haven't accepted yet, and which it leaves out. It goes
 * when nothing in the item is left to review. Not a live region: it changes as the person
 * accepts, and each of those already has its own toast.
 */
export function TryItChangesLine({ watch }: TryItChangesLineProps) {
  const changes = useTryItChanges(watch);
  const sentences = tryItChangesSentences(changes);
  if (sentences.length === 0) return null;
  return (
    <div className="text-small text-fg-muted">
      {sentences.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
    </div>
  );
}

/** The item's changes to review as `watch` last gave them; none until it does. */
function useTryItChanges(watch: WatchTryItChanges | undefined): TryItChanges {
  const [changes, setChanges] = useState(noTryItChanges);
  useEffect(() => {
    if (watch === undefined) return undefined;
    return watch(setChanges);
  }, [watch]);
  return changes;
}
