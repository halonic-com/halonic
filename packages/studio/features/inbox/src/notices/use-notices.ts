import { useEffect, useState } from "react";
import type { FailedRunNotice } from "./failed-run-notices.ts";
import type { InboxNotices } from "./inbox-notices.ts";

/** What the Inbox shows of its notices. */
export interface NoticesState {
  readonly notices: readonly FailedRunNotice[];
  /** Why the last read failed, until one succeeds. The notices stay as they were. */
  readonly error: unknown;
}

/**
 * The notices, read again whenever they may have changed. With no source there are none, and the
 * Notices heading is hidden, as it is when nothing failed.
 */
export function useNotices(source: InboxNotices | undefined): NoticesState & { retry(): void } {
  const [state, setState] = useState<NoticesState>({ notices: [], error: undefined });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (source === undefined) {
      setState({ notices: [], error: undefined });
      return;
    }
    let current = true;
    let latest = 0;
    // Only the newest read counts: an older one that answers last must not overwrite it.
    const read = () => {
      const mine = ++latest;
      source.list().then(
        (notices) => {
          if (current && mine === latest) setState({ notices, error: undefined });
        },
        (error: unknown) => {
          if (current && mine === latest) setState((was) => ({ notices: was.notices, error }));
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
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
