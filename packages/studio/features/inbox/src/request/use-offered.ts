import { useEffect, useState } from "react";
import type { InboxRequests, RequestWorkflow } from "./inbox-requests.ts";

/** The workflows the Inbox offers as requests, and whether the latest read of them failed. */
export interface Offered {
  readonly list: readonly RequestWorkflow[];
  /** The latest read failed; the Inbox says so rather than look like a workspace with none. */
  readonly failed: boolean;
  /** Reads them again, as **Try again** does. */
  readonly retry: () => void;
}

/**
 * The workflows the Inbox offers as requests, read again whenever they may have changed. Empty
 * while loading and when there is no source: the form is then hidden and the Inbox is the list
 * alone, as for a workspace with no `start:` block. A read that fails is `failed`, so the Inbox
 * can say so (states audit gap 5).
 */
export function useOffered(requests: InboxRequests | undefined): Offered {
  const [offered, setOffered] = useState<readonly RequestWorkflow[]>([]);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  // `tries` counts the presses of Try again, so each press reads again.
  useEffect(() => {
    setFailed(false);
    if (requests === undefined) {
      setOffered([]);
      return;
    }
    let current = true;
    let latest = 0;
    // Only the newest read counts: an older one that answers last must not overwrite it.
    const read = () => {
      const mine = ++latest;
      requests.offered().then(
        (list) => {
          if (!current || mine !== latest) return;
          setOffered(list);
          setFailed(false);
        },
        () => {
          if (!current || mine !== latest) return;
          setOffered([]);
          setFailed(true);
        },
      );
    };
    read();
    const stop = requests.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [requests, tries]);
  return { list: offered, failed, retry: () => setTries((count) => count + 1) };
}
