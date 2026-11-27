import { useCallback, useSyncExternalStore } from "react";
import type { AgentSandboxHost } from "../api.ts";

/** What a host without `subscribeStudioStartsUnfenced` gives back: nothing to stop. */
const stopNothing = () => undefined;

/**
 * Whether this Studio can itself start an agent outside its sandbox, read again whenever the host
 * says it changed: the host answers after Studio opens, so a section already open moves from the
 * cautious `false` to the answer without being drawn again (HAL-19614). Absent reads as can't.
 *
 * @example
 * const startsUnfenced = useStudioStartsUnfenced(host);
 */
export function useStudioStartsUnfenced(host: AgentSandboxHost | undefined): boolean {
  const subscribe = useCallback(
    (listener: () => void) => host?.subscribeStudioStartsUnfenced?.(listener) ?? stopNothing,
    [host],
  );
  return useSyncExternalStore(subscribe, () => host?.studioStartsUnfenced ?? false);
}
