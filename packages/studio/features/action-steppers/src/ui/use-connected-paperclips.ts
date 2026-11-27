import type { AgentConnections } from "@halonicjs/studio-services";
import { useEffect, useState } from "react";
import {
  type ConnectionsRead,
  connectedPaperclips,
  noConnections,
} from "../review/paperclip-host.ts";

/**
 * The Paperclips the user connected, read again whenever this window's connections change, for
 * the review's `paperclips` (`action-steppers.paperclip-host`). It is `loading` until the first
 * read finishes, and `failed` when a read fails, so neither looks like "none connected". Without
 * `connections`, as in a browser, there are none, so no Paperclip request runs.
 */
export function useConnectedPaperclips(connections: AgentConnections | undefined): ConnectionsRead {
  const [read, setRead] = useState<ConnectionsRead>(
    connections === undefined ? noConnections : { kind: "loading" },
  );
  useEffect(() => {
    if (connections === undefined) {
      setRead(noConnections);
      return;
    }
    let live = true;
    const readAgain = () => {
      connections.list().then(
        (listed) => {
          if (live) setRead({ kind: "read", paperclips: connectedPaperclips(listed) });
        },
        (error: unknown) => {
          console.error("The stepper couldn't read the connections", error);
          if (live) setRead({ kind: "failed" });
        },
      );
    };
    readAgain();
    const stop = connections.subscribe(readAgain);
    return () => {
      live = false;
      stop();
    };
  }, [connections]);
  return read;
}
