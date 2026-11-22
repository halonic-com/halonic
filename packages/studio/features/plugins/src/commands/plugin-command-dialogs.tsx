import type { DialogHostProps } from "@halonicjs/studio-shell";
import { PluginsService } from "../api.ts";
import { PLUGIN_HUB, PLUGIN_KIND } from "../page/plugin-pages.ts";
import { PluginCommandHost } from "./plugin-command-host.tsx";

/** The plugins feature's dialogs: the dialog of the plugin command picked in Ctrl K. */
export function PluginCommandDialogs({ context }: DialogHostProps) {
  const { opener, caller } = context.services.get(PluginsService);
  const { openItem } = context;
  return (
    <PluginCommandHost
      opener={opener}
      caller={caller}
      openPlugin={
        openItem === undefined
          ? undefined
          : (plugin) => openItem({ kind: PLUGIN_KIND, hub: PLUGIN_HUB, id: plugin })
      }
    />
  );
}
