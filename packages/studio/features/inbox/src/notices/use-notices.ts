import { useEffect, useState } from "react";
import type { InboxNotice, InboxNotices } from "./inbox-notices.ts";

/** What the Inbox shows of its notices. */
export interface NoticesState {
  readonly notices: readonly InboxNotice[];
  /** Why the last read failed, until one succeeds. The notices stay as they were. */
  readonly error: unknown;
}

/**
 * The notices, read again whenever they may have changed. With no source there are none, and the
 * Notices heading is hidden, as it is when nothing failed.
 */
export function useNotices(source: InboxNotices | undefined): NoticesState & { retry(): void } {
  const [held, setState] = useState<NoticesState & { source: InboxNotices | undefined }>({
    source,
    notices: [],
    error: undefined,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (source === undefined) {
      setState({ source, notices: [], error: undefined });
      return;
    }
    let current = true;
    let latest = 0;
    // Only the newest read counts: an older one that answers last must not overwrite it.
    const read = () => {
      const mine = ++latest;
      source.list().then(
        (notices) => {
          if (current && mine === latest) setState({ source, notices, error: undefined });
        },
        (error: unknown) => {
          if (current && mine === latest)
            setState((was) => ({
              source,
              // A failed read keeps this source's notices, never another source's.
              notices: was.source === source ? was.notices : [],
              error,
            }));
        },
      );
    };
    read();
    const stop = source.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [source, attempt]);
  // Until this source has answered, what was read from another one is not shown.
  const state = held.source === source ? held : { notices: [], error: undefined };
  return { notices: state.notices, error: state.error, retry: () => setAttempt((n) => n + 1) };
}
