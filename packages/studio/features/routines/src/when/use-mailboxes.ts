import { useEffect, useState } from "react";
import type { RoutineMailbox, RoutineRef, RoutinesHost } from "../api.ts";

/**
 * The Google connectors the routine's mail trigger can watch, read again when the routine's hub
 * changes. Empty while they are read, and when they can't be: the trigger picker then says to add
 * a Google connector, which is true enough, and nothing else on the card stops.
 */
export function useMailboxes(host: RoutinesHost, ref: RoutineRef): readonly RoutineMailbox[] {
  const [mailboxes, setMailboxes] = useState<readonly RoutineMailbox[]>([]);
  const { hubId, id } = ref;
  useEffect(() => {
    let current = true;
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
