import type { MessagingSource } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import { asOfText } from "./phone-forms.ts";
import type { PhoneMessaging } from "./phone-messenger.tsx";
import {
  type OfflineSource,
  type ReadFailure,
  readLines,
  phoneMessengerWords as words,
} from "./phone-messenger-words.ts";

/** What the line in place of an unread list or chat needs. */
export interface ReadFailedLineProps {
  readonly messaging: PhoneMessaging;
  /** Why the newest read failed; `undefined` while nothing has. */
  readonly failure: ReadFailure | undefined;
  readonly computer: string;
  /** Reads again what failed. */
  readonly onTryAgain: () => void;
}

/**
 * Says why a list or a chat couldn't be read, with Try again, instead of an empty screen
 * (HAL-19042). When the computer says a source is `offline`, it asks which sources are and names
 * each, with when it last answered, and says nothing until that read has answered. The live
 * region stays in place while nothing failed, since some screen readers skip one that appears
 * with its text already in it.
 */
export function ReadFailedLine({ messaging, failure, computer, onTryAgain }: ReadFailedLineProps) {
  // `undefined` while the sources read is out, so the generic line never shows first.
  const [offline, setOffline] = useState<readonly OfflineSource[] | undefined>(undefined);
  const sourceOffline = failure?.kind === "refused" && failure.code === "offline";

  useEffect(() => {
    setOffline(undefined);
    if (!sourceOffline) return;
    let current = true;
    void messaging.readList("sources").then((read) => {
      if (!current) return;
      setOffline(read.kind === "done" ? offlineSources(read.value.items, new Date()) : []);
    });
    return () => {
      current = false;
    };
  }, [messaging, sourceOffline]);

  const waiting = sourceOffline && offline === undefined;
  const lines = failure === undefined || waiting ? [] : readLines(failure, offline ?? [], computer);
  return (
    <div className={failure === undefined ? "" : "flex flex-col items-start gap-2 p-4"}>
      <div role="status" className="flex flex-col gap-2">
        {lines.map((line, index) => (
          // Two sources can read the same; lines never reorder, so the index is the key.
          <p key={index} className="text-body text-fg">
            {line}
          </p>
        ))}
      </div>
      {failure === undefined ? null : (
        <Button variant="secondary" size="touch" onClick={onTryAgain}>
          {words.tryAgain}
        </Button>
      )}
    </div>
  );
}

/** The offline sources among `items`, each with when it last answered, worded for `now`. */
function offlineSources(items: readonly unknown[], now: Date): readonly OfflineSource[] {
  return items
    .filter(isSource)
    .flatMap((source) =>
      source.state.kind === "offline"
        ? [{ label: source.label, asOf: asOfText(new Date(source.state.asOf), now) }]
        : [],
    );
}

function isSource(item: unknown): item is MessagingSource {
  return (
    typeof item === "object" &&
    item !== null &&
    "label" in item &&
    typeof item.label === "string" &&
    "state" in item &&
    typeof item.state === "object" &&
    item.state !== null &&
    "kind" in item.state &&
    (item.state.kind !== "offline" || ("asOf" in item.state && typeof item.state.asOf === "string"))
  );
}
