import type { AgentConnections } from "@halonicjs/studio-services";
import { useEffect, useState } from "react";
import { type ConnectedPaperclip, connectedPaperclips } from "../review/paperclip-host.ts";

/**
 * The Paperclips the user connected, read again whenever this window's connections change, for
 * the review's `paperclips` (`action-steppers.paperclip-host`). Without `connections`, as in a
 * browser, there are none, so no Paperclip request runs.
 */
export function useConnectedPaperclips(
  connections: AgentConnections | undefined,
): readonly ConnectedPaperclip[] {
  const [paperclips, setPaperclips] = useState<readonly ConnectedPaperclip[]>([]);
  useEffect(() => {
    if (connections === undefined) return;
    let live = true;
    const read = () => {
      connections.list().then(
        (listed) => {
          if (live) setPaperclips(connectedPaperclips(listed));
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
  return paperclips;
}
