import type { CommandContribution, WorkspaceContext } from "@halonicjs/studio-shell";
import { UpdaterService } from "../api.ts";
import { checkAnnouncement } from "./about-state.ts";
import { RestartFlowService } from "./restart-flow.ts";
import * as text from "./restart-text.ts";

/**
 * The update commands Ctrl K lists (`settings.update-commands`): "Check for Halonic updates"
 * wherever the app has an updater, and "Restart to update Halonic" only while an update is ready.
 * "About Halonic" is a section command. Without an updater there are none.
 */
export function updateCommands(context?: WorkspaceContext): readonly CommandContribution[] {
  const host = context?.services.find(UpdaterService);
  if (context === undefined || host === undefined) return [];
  const commands: CommandContribution[] = [
    {
      id: "settings.update.check",
      title: text.CHECK_COMMAND,
      run: async (runContext) => {
        const line = checkAnnouncement(await host.check(), new Date());
        if (line !== null) runContext.announcer.announce(line);
      },
    },
  ];
  const flow = context.services.find(RestartFlowService);
  if (flow?.canRestart()) {
    commands.push({
      id: "settings.update.restart",
      title: text.RESTART_COMMAND,
      run: () => flow.request(),
    });
  }
  return commands;
}
