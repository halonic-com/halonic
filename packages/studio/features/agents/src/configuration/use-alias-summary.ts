import { useEffect, useState } from "react";
import type { AgentRef, AgentsHost, AliasSummary } from "../api.ts";

/**
 * The alias's provider, model and cost for the line under the Model page's picker, read when the
 * alias changes and after each change of the workspace's files (a price may be added on Models);
 * `undefined` while it is read, for an empty pick, or where the host can't tell. The line only
 * adds detail to the picker, so when the host can't answer no line shows and the picker still works.
 */
export function useAliasSummary(
  host: AgentsHost,
  agent: AgentRef,
  alias: string,
): AliasSummary | undefined {
  const { hubId, id } = agent;
  const [shown, setShown] = useState<{ alias: string; summary: AliasSummary | undefined }>();
  useEffect(() => {
    const read = host.aliasSummary?.bind(host);
    if (read === undefined || alias === "") return;
    // Only the newest answer counts, so a slow one can't show the line of an alias picked before.
    let current = true;
    const ask = () =>
      void read({ hubId, id }, alias)
        .catch(() => undefined)
        .then((summary) => {
          if (current) setShown({ alias, summary });
        });
    ask();
    const stop = host.subscribe(ask);
    return () => {
      current = false;
      stop();
    };
  }, [host, hubId, id, alias]);
  return shown?.alias === alias ? shown.summary : undefined;
}
