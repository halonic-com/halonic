import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Check this computer feature (first-run-progress section 4, HAL-13411): `halonic doctor`'s
 * checks for the open workspace, with the lines only Studio knows, and the report a person can
 * copy (`check-computer.report`). The dialog, its command and its Help item come with the dialog.
 */
export const checkComputerFeature = defineFeature({
  id: "check-computer",
  title: "Check this computer",
  register() {
    // The dialog host, the command and the Help item land with the dialog (HAL-13411, PR 3).
  },
});
