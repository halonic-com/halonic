import { useEffect, useRef, useState } from "react";
import type { AgentsHost } from "../api.ts";

/**
 * The agents among `agentIds` whose On this computer choice is on hold: chosen on this computer
 * for an earlier version of the agent's file, so the agent runs in its sandbox until a person
 * confirms again (checklist 3.8). Read when the page opens and again on each change the host
 * reports, which includes a choice saved on another page.
 *
 * An agent whose placement can't be read, or where Studio can't choose (the browser), counts as
 * not on hold: the engine runs it in its sandbox either way, and its own Harness page says why the
 * read failed, so the run controls don't guess.
 *
 * @example
 * const onHold = useOnHoldAgents(host, "acme", ["writer", "sorter"]); // ["writer"]
 */
export function useOnHoldAgents(
  host: AgentsHost | undefined,
  hubId: string,
  agentIds: readonly string[],
): readonly string[] {
  const [onHold, setOnHold] = useState<readonly string[]>([]);
  // Counts the reads, so only the newest one's answer is used, as in `usePlacement`.
  const newestRead = useRef(0);
  // The ids as one value, so a page that builds a new array on each draw doesn't read again.
  const idsKey = agentIds.join("\n");

  useEffect(() => {
    const ids = idsKey === "" ? [] : idsKey.split("\n");
    if (host === undefined || ids.length === 0) {
      setOnHold([]);
      return;
    }
    const read = async () => {
      const mine = ++newestRead.current;
      const held = await Promise.all(ids.map((id) => isOnHold(host, hubId, id)));
      if (mine === newestRead.current) setOnHold(ids.filter((_, index) => held[index]));
    };
    void read();
    const stop = host.subscribe(() => void read());
    return () => {
      stop();
      newestRead.current += 1;
    };
  }, [host, hubId, idsKey]);

  return onHold;
}

async function isOnHold(host: AgentsHost, hubId: string, id: string): Promise<boolean> {
  try {
    const placement = await host.placement({ hubId, id });
    return placement?.runsOn === "on-hold";
  } catch {
    // Not knowing isn't on hold: see `useOnHoldAgents`.
    return false;
  }
}
