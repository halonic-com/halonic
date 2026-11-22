import { useSyncExternalStore } from "react";
import { PluginCommandDialog, type PluginToolCaller } from "./plugin-command-dialog.tsx";
import type { PluginCommandOpener } from "./plugin-command-source.ts";

/** The props of `PluginCommandHost`. */
export interface PluginCommandHostProps {
  readonly opener: PluginCommandOpener;
  /** Calls a plugin's tools; wrap it in `timedToolCaller` so a call can't hang the dialog. */
  readonly caller: PluginToolCaller;
  /** Opens a plugin's page by its id; without it, where the window can't open pages, the dialog links none. */
  readonly openPlugin?: ((plugin: string) => void) | undefined;
}

/**
 * Draws the dialog of the plugin command picked in Ctrl K, and nothing when none is open. The
 * Studio window renders it once; the dialog is modal, so where it sits doesn't matter.
 *
 * @example
 * <PluginCommandHost opener={opener} caller={timedToolCaller(pluginTools)} />
 */
export function PluginCommandHost({ opener, caller, openPlugin }: PluginCommandHostProps) {
  const opened = useSyncExternalStore(opener.subscribe, opener.current);
  if (opened === undefined) return null;
  return (
    <PluginCommandDialog
      key={opened.opening}
      plugin={opened.plugin}
      command={opened.command}
      caller={caller}
      onClose={() => opener.close()}
      // The dialog is modal, so it closes before the page opens behind it.
      onOpenPlugin={
        openPlugin === undefined
          ? undefined
          : () => {
              opener.close();
              openPlugin(opened.plugin.id);
            }
      }
    />
  );
}
