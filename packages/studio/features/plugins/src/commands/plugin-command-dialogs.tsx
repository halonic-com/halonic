import type { DialogHostProps } from "@halonicjs/studio-shell";
import { PluginsService } from "../api.ts";
import { PluginCommandHost } from "./plugin-command-host.tsx";

/** The plugins feature's dialogs: the dialog of the plugin command picked in Ctrl K. */
export function PluginCommandDialogs({ context }: DialogHostProps) {
  const { opener, caller } = context.services.get(PluginsService);
  return <PluginCommandHost opener={opener} caller={caller} />;
}
