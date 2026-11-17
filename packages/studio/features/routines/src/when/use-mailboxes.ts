import { useEffect, useState } from "react";
import type { RoutineMailbox, RoutineRef, RoutinesHost } from "../api.ts";

/**
 * The Google connectors the routine's mail trigger can watch, read again when the routine's hub
 * changes. `undefined` while they are read; empty when there are none and when they can't be
 * read: the trigger picker then says to add a Google connector, which is true enough, and
 * nothing else on the card stops.
 */
export function useMailboxes(
  host: RoutinesHost,
  ref: RoutineRef,
): readonly RoutineMailbox[] | undefined {
  const [mailboxes, setMailboxes] = useState<readonly RoutineMailbox[] | undefined>();
  const { hubId, id } = ref;
  useEffect(() => {
    let current = true;
    setMailboxes(undefined);
    host.mailboxes({ hubId, id }).then(
      (found) => current && setMailboxes(found),
      () => current && setMailboxes([]),
    );
    return () => {
      current = false;
    };
  }, [host, hubId, id]);
  return mailboxes;
}
