import { DamagedRunLog, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { useEffect, useState } from "react";
import type { InboxItem } from "../inbox-items.ts";
import { startInput } from "../plain/wait-parts.ts";

/**
 * The text a wait step's run started with in its workflow's start field, read from its log when
 * the run or the field changes (`inbox.wait-context`); `undefined` until it is read, for any other
 * item, without a source or field, and when the log can't be read (logged to the console). A
 * damaged log still gives its start.
 */
export function useStartInput(
  source: RunsSource | undefined,
  item: InboxItem,
  field: string | undefined,
): string | undefined {
  // Only a wait card quotes the input, so no other item reads the run's log.
  const runId = item.kind === "wait" ? item.runId : undefined;
  const [read, setRead] = useState<{ readonly key: string; readonly text?: string }>();
  const key = `${runId}:${field}`;
  useEffect(() => {
    if (source === undefined || runId === undefined || field === undefined) return;
    let current = true;
    source.log(runId).then(
      (events) => {
        if (current) setRead(withText(key, startInput(events, field)));
      },
      (error: unknown) => {
        if (error instanceof DamagedRunLog) {
          if (current) setRead(withText(key, startInput(error.events, field)));
          return;
        }
        console.error("Couldn't read the run's input.", error);
      },
    );
    return () => {
      current = false;
    };
  }, [source, runId, field, key]);
  return read !== undefined && read.key === key ? read.text : undefined;
}

function withText(key: string, text: string | undefined) {
  return text === undefined ? { key } : { key, text };
}
