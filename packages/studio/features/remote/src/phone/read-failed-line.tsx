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
  readonly failure: ReadFailure;
  readonly computer: string;
  /** Reads again what failed. */
  readonly onTryAgain: () => void;
}

/**
 * Says why a list or a chat couldn't be read, with Try again, instead of an empty screen
 * (HAL-19042). When the computer says a source is `offline`, it asks which sources are and names
 * each, with when it last answered.
 */
export function ReadFailedLine({ messaging, failure, computer, onTryAgain }: ReadFailedLineProps) {
  const [offline, setOffline] = useState<readonly OfflineSource[]>([]);
  const sourceOffline = failure.kind === "refused" && failure.code === "offline";

  useEffect(() => {
    if (!sourceOffline) return;
    let current = true;
    void messaging.readList("sources").then((read) => {
      if (current && read.kind === "done") setOffline(offlineSources(read.value.items, new Date()));
    });
    return () => {
      current = false;
    };
  }, [messaging, sourceOffline]);

  return (
    <div className="flex flex-col items-start gap-2 p-4">
      {readLines(failure, offline, computer).map((line) => (
        <p key={line} className="text-body text-fg">
          {line}
        </p>
      ))}
      <Button variant="secondary" size="touch" onClick={onTryAgain}>
        {words.tryAgain}
      </Button>
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
