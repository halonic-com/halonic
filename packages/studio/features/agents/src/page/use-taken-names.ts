import { useEffect, useState } from "react";
import type { AgentRef, AgentsHost } from "../api.ts";

/** The names of the hub's other agents, for the rename check; read again when a file changes. */
export function useTakenNames(host: AgentsHost, { hubId, id }: AgentRef): readonly string[] {
  const [takenNames, setTakenNames] = useState<readonly string[]>([]);
  useEffect(() => {
    const read = () =>
      host
        .list()
        .then((agents) =>
          setTakenNames(
            agents
              .filter((agent) => agent.hubId === hubId && agent.id !== id)
              .map((agent) => agent.name),
          ),
        )
        .catch(() => setTakenNames([]));
    void read();
    return host.subscribe(() => void read());
  }, [host, hubId, id]);
  return takenNames;
}
