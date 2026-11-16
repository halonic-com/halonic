import { useEffect, useState } from "react";
import type { InboxRequests, RequestWorkflow } from "./inbox-requests.ts";

/**
 * The workflows the Inbox offers as requests, read again whenever they may have changed. Empty
 * while loading, when there is no source, and when a read fails: the form is then hidden and the
 * Inbox is the list alone, as for a workspace with no `start:` block.
 */
export function useOffered(requests: InboxRequests | undefined): readonly RequestWorkflow[] {
  const [offered, setOffered] = useState<readonly RequestWorkflow[]>([]);
  useEffect(() => {
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
          if (current && mine === latest) setOffered(list);
        },
        () => {
          if (current && mine === latest) setOffered([]);
        },
      );
    };
    read();
    const stop = requests.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [requests]);
  return offered;
}
