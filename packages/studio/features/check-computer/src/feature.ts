import { defineFeature, type ServiceLookup } from "@halonicjs/studio-shell";
import { CheckComputerSourceService, checkComputerCommand } from "./api.ts";
import { CheckComputerOpener, CheckComputerOpenerService } from "./check-computer-opener.ts";
import { dialogWords } from "./ui/dialog-words.ts";

/**
 * Opens the dialog only when the app gives the open folder its facts. Without them it would show
 * nothing, and an opening kept for later would pop the dialog up as soon as a source appeared.
 */
function openCheck(services: ServiceLookup): void {
  if (services.find(CheckComputerSourceService) === undefined) return;
  services.get(CheckComputerOpenerService).open();
}

/**
 * The Check this computer feature (first-run-progress section 4, HAL-13411): the dialog with
 * `halonic doctor`'s checks for the open workspace and the lines only Studio knows
 * (`check-computer.dialog`), its report (`check-computer.report`), the command every
 * **Something wrong?** runs, and **Help › Check this computer**. The app gives it the facts
 * (`CheckComputerSourceService`); without them, as in the browser demo, it shows nothing.
 */
export const checkComputerFeature = defineFeature({
  id: "check-computer",
  title: "Check this computer",
  wants: [CheckComputerSourceService],
  provides: [CheckComputerOpenerService],
  register(studio) {
    studio.services.provide(CheckComputerOpenerService, () => new CheckComputerOpener());
    studio.dialogs.add({
      id: "check-computer.dialog",
      order: 50,
      view: "CheckComputerHost",
      load: () => import("./ui/check-computer-host.tsx"),
    });
    studio.commands.add({
      id: checkComputerCommand,
      title: dialogWords.title,
      run: (context) => openCheck(context.services),
    });
    // The Help menu's first group, without a title (`shell.help-menu`).
    studio.help.add({
      id: "check-computer.help",
      order: 10,
      items: (context) =>
        context.services.find(CheckComputerSourceService) === undefined
          ? []
          : [
              {
                id: "check-this-computer",
                label: dialogWords.title,
                run: () => openCheck(context.services),
              },
            ],
    });
  },
});
