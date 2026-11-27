import type { AgentConnections } from "@halonicjs/studio-services";
import { useEffect, useState } from "react";
import { connectedPaperclipHosts } from "../review/paperclip-host.ts";

/**
 * The hosts of the Paperclips the user connected, read again whenever the connections change, for
 * the review's `paperclipHosts` (`action-steppers.paperclip-host`). Without `connections`, as in a
 * browser, there are none, so no Paperclip request runs.
 */
export function usePaperclipHosts(connections: AgentConnections | undefined): readonly string[] {
  const [hosts, setHosts] = useState<readonly string[]>([]);
  useEffect(() => {
    if (connections === undefined) return;
    let live = true;
    const read = () => {
      connections.list().then(
        (listed) => {
          if (live) setHosts(connectedPaperclipHosts(listed));
        },
        (error: unknown) => console.error("The stepper couldn't read the connections", error),
      );
    };
    read();
    const stop = connections.subscribe(read);
    return () => {
      live = false;
      stop();
    };
  }, [connections]);
  return hosts;
}
