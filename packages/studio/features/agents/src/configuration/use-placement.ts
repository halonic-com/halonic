import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentPlacementState, AgentRef, AgentsHost } from "../api.ts";

/** What the host said of where the agent runs, or that it couldn't say. */
export type PlacementLoad =
  | { readonly kind: "loading" }
  /** Studio can't choose where agents run here (no agent host): Where it runs isn't drawn. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "loaded"; readonly placement: AgentPlacementState };

/** What {@link usePlacement} hands Where it runs. */
export interface PlacementState {
  readonly load: PlacementLoad;
  /** Reads it again; resolves when the answer is in, and never rejects. */
  readonly reload: () => Promise<void>;
}

/** The words of a throw. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Where the agent runs on this computer, read when the page opens and again after each change of
 * the workspace's files, since saving the agent's file can put the choice on hold.
 */
export function usePlacement(host: AgentsHost, hubId: string, id: string): PlacementState {
  const [load, setLoad] = useState<PlacementLoad>({ kind: "loading" });
  // Counts the reads, so only the newest one's answer is used: a slow answer for another agent,
  // or one that arrives after the page is left, is dropped.
  const newestRead = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++newestRead.current;
    const ref: AgentRef = { hubId, id };
    let next: PlacementLoad;
    try {
      const placement = await host.placement(ref);
      next = placement === undefined ? { kind: "unavailable" } : { kind: "loaded", placement };
    } catch (error) {
      next = { kind: "failed", reason: reasonOf(error) };
    }
    if (mine === newestRead.current) setLoad(next);
  }, [host, hubId, id]);
  useEffect(() => {
    setLoad({ kind: "loading" });
    void reload();
    const stop = host.subscribe(() => void reload());
    return () => {
      stop();
      newestRead.current += 1;
    };
  }, [host, reload]);
  return { load, reload };
}
