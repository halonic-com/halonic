import { errorReasonFor } from "@halonicjs/studio-shell";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AgentPlacementState, AgentRef, AgentsHost } from "../api.ts";

/** What the host said of where the agent runs, or that it couldn't say. */
export type PlacementLoad =
  | { readonly kind: "loading" }
  /** Studio can't choose where agents run here (no agent host): only a desktop app line is drawn. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "loaded"; readonly placement: AgentPlacementState };

/** What {@link usePlacement} hands Where it runs. */
export interface PlacementState {
  readonly load: PlacementLoad;
  /** Reads it again; resolves when the answer is in, and never rejects. */
  readonly reload: () => Promise<void>;
  /**
   * Opens the agent's file at `path` in a new tab next to the agent's, for the warning's
   * **Open the file ›**; absent where the app can't.
   */
  readonly openFile?: ((path: string) => void) | undefined;
}

/**
 * Where the agent runs on this computer, read when the page opens and again after each change of
 * the workspace's files, since saving the agent's file can put the choice on hold.
 */
function useOwnPlacement(
  host: AgentsHost,
  hubId: string,
  id: string,
  // False while a shared read for the same agent answers instead, so the host isn't read twice.
  active = true,
): PlacementState {
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
      next = { kind: "failed", reason: errorReasonFor(error) };
    }
    if (mine === newestRead.current) setLoad(next);
  }, [host, hubId, id]);
  useEffect(() => {
    if (!active) return;
    setLoad({ kind: "loading" });
    void reload();
    const stop = host.subscribe(() => void reload());
    return () => {
      stop();
      newestRead.current += 1;
    };
  }, [host, reload, active]);
  return { load, reload };
}

/** The read an agent page shares, with the agent it is for. */
interface SharedPlacement {
  readonly hubId: string;
  readonly id: string;
  readonly state: PlacementState;
}

const SharedPlacementContext = createContext<SharedPlacement | undefined>(undefined);

/** Props for {@link PlacementProvider}. */
export interface PlacementProviderProps {
  readonly host: AgentsHost;
  readonly hubId: string;
  readonly id: string;
  /** Opens a file in a new tab next to the agent's; absent where the app can't open one. */
  readonly openFile?: ((path: string) => void) | undefined;
  readonly children: ReactNode;
}

/**
 * Reads where the agent runs once for everything under it, so the header's `Full access` chip
 * follows a choice made in Where it runs at once: a choice changes no file, so the host's
 * file-change signal alone wouldn't tell the chip.
 */
export function PlacementProvider({ host, hubId, id, openFile, children }: PlacementProviderProps) {
  const state = { ...useOwnPlacement(host, hubId, id), openFile };
  return createElement(SharedPlacementContext.Provider, { value: { hubId, id, state } }, children);
}

/**
 * Where the agent runs on this computer: the agent page's shared read when it is for the same
 * agent, otherwise a read of its own.
 */
export function usePlacement(host: AgentsHost, hubId: string, id: string): PlacementState {
  const shared = useContext(SharedPlacementContext);
  const sameAgent = shared !== undefined && shared.hubId === hubId && shared.id === id;
  const own = useOwnPlacement(host, hubId, id, !sameAgent);
  return sameAgent ? shared.state : own;
}
