import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useCallback, useSyncExternalStore } from "react";
import { ChangesListService } from "../changes-list.ts";
import { VersionDialogs } from "./version-dialogs.tsx";

/**
 * The feature's dialog host: draws the Create version another feature opened through
 * `VersionDialogService`, over whatever page is open. Focus goes back to what opened it, such
 * as the agent page's "Review and make live"; when that has gone, the dialog's own fallback
 * applies. The caller hears the outcome from the service, so nothing more happens on create.
 */
export function VersionDialogHost({ context }: DialogHostProps) {
  const list = context.services.get(ChangesListService);
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  return (
    <VersionDialogs
      list={list}
      state={state}
      opener="elsewhere"
      returnFocus={() => null}
      onCreated={() => undefined}
    />
  );
}
