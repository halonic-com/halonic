import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRef, AgentsHost, MissingModelKey } from "../api.ts";

/** Whether the agent's model is missing its key (H19), and the way to ask again. */
export interface ModelKeyCheck {
  /** The model and its provider while the key isn't stored; `undefined` once it can be used. */
  readonly missing: MissingModelKey | undefined;
  /** Asks the host again, as Send does, and answers what it found. */
  again(): Promise<MissingModelKey | undefined>;
}

/**
 * Reads whether the agent's model needs a key that isn't stored, when the chat opens and after each
 * change of the workspace's files (the agent's model may change); `undefined` where the host can't
 * tell. A key is stored outside the files, so Send asks again before it sends (flow-assistant 7).
 * When the host can't answer, no line shows and the message goes: a reply that fails for the key
 * then says so on its own line, with **Open Models ›**.
 */
export function useModelKey(host: AgentsHost, agent: AgentRef): ModelKeyCheck | undefined {
  const { hubId, id } = agent;
  const [missing, setMissing] = useState<MissingModelKey | undefined>(undefined);
  // Only the newest answer counts, so a slow one can't bring back a line a newer one took away.
  const asked = useRef(0);
  const read = useCallback(async (): Promise<MissingModelKey | undefined> => {
    if (host.missingModelKey === undefined) return undefined;
    asked.current += 1;
    const turn = asked.current;
    const found = await host.missingModelKey({ hubId, id }).catch(() => undefined);
    if (turn === asked.current) setMissing(found);
    return found;
  }, [host, hubId, id]);
  useEffect(() => {
    void read();
    const stop = host.subscribe(() => void read());
    return () => {
      // A read still on its way when the chat goes changes nothing.
      asked.current += 1;
      stop();
    };
  }, [host, read]);
  if (host.missingModelKey === undefined) return undefined;
  return { missing, again: read };
}
