import { useEffect, useState } from "react";
import type { ConnectorStatusHost } from "../connector-status-host.ts";

/** How many of the open workspace's connectors are blocked, read while the phone's list of kinds shows; 0 until read or when the read fails. */
export function useBlockedConnectors(
  host: ConnectorStatusHost | undefined,
  active: boolean,
): number {
  const [blocked, setBlocked] = useState(0);
  useEffect(() => {
    if (host === undefined || !active) return undefined;
    let current = true;
    const read = () => {
      host
        .list()
        .then((connectors) => {
          const count = connectors.filter((connector) => connector.blocked === true).length;
          if (current) setBlocked(count);
        })
        // A status that can't be read adds nothing to the count line, as a kind without a count.
        .catch(() => undefined);
    };
    read();
    const stop = host.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [host, active]);
  return blocked;
}
