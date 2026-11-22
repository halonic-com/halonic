import { defineFeature } from "@halonicjs/studio-shell";
import { CheckComputerSourceService, checkComputerCommand } from "./api.ts";
import { CheckComputerOpener, CheckComputerOpenerService } from "./check-computer-opener.ts";
import { dialogWords } from "./ui/dialog-words.ts";

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
      run: (context) => context.services.get(CheckComputerOpenerService).open(),
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
                run: () => context.services.get(CheckComputerOpenerService).open(),
              },
            ],
    });
  },
});
