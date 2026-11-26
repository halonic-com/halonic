import { useEffect, useRef, useState } from "react";
import type { AgentsHost } from "../api.ts";

/**
 * The monthly budget's sentence while this month's spend has reached it (states H21), read when the
 * chat opens and after each change of the workspace's files, since a changed budget is one;
 * `undefined` while there is room, or where the host can't tell.
 */
export function useBudgetReached(host: AgentsHost): string | undefined {
  const [reached, setReached] = useState<string | undefined>(undefined);
  // Only the newest answer counts, so a slow one can't bring back a line a newer one took away.
  const asked = useRef(0);
  useEffect(() => {
    if (host.budgetReached === undefined) return;
    const read = async () => {
      asked.current += 1;
      const turn = asked.current;
      const found = await host.budgetReached?.().catch(() => undefined);
      if (turn === asked.current) setReached(found);
    };
    void read();
    const stop = host.subscribe(() => void read());
    return () => {
      // A read still on its way when the chat goes changes nothing.
      asked.current += 1;
      stop();
    };
  }, [host]);
  return reached;
}
