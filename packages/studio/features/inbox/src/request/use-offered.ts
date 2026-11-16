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
    const read = () => {
      requests.offered().then(
        (list) => {
          if (current) setOffered(list);
        },
        () => {
          if (current) setOffered([]);
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
