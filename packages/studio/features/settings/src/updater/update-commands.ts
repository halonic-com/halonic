import type { CommandContribution, WorkspaceContext } from "@halonicjs/studio-shell";
import { UpdaterService } from "../api.ts";
import { checkAnnouncement } from "./about-state.ts";
import { RestartFlowService } from "./restart-flow.ts";
import * as text from "./restart-text.ts";

/**
 * The update commands Ctrl K lists (`settings.update-commands`): "Check for Halonic updates"
 * wherever the app has an updater, and "Restart to update Halonic" only while an update is ready.
 * "About Halonic" opens Settings on its section, also without an updater: the section then says
 * where updates are installed. The others need an updater.
 */
export function updateCommands(context?: WorkspaceContext): readonly CommandContribution[] {
  if (context === undefined) return [];
  const about: CommandContribution = {
    id: "settings.update.about",
    title: text.ABOUT_COMMAND,
    run: (runContext) => runContext.openSettings?.("about"),
  };
  const host = context.services.find(UpdaterService);
  if (host === undefined) return [about];
  const commands: CommandContribution[] = [
    about,
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
