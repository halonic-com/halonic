import type { RestartRuns } from "./restart-runs.ts";

/**
 * The words of the restart flow: microcopy 20.2, 20.3 and 20.5 as flow-install-update 4.4 to 4.6
 * and the checklist (HAL-1151, part 3) quote them. Values in `${}` are filled in at run time.
 */
export const RESTART_TO_UPDATE = "Restart to update";
export const RESTART_COMMAND = "Restart to update Halonic";
export const ABOUT_COMMAND = "About Halonic";
export const CHECK_COMMAND = "Check for Halonic updates";

export const DIALOG_TITLE = "Restart Halonic now?";
export const DIALOG_BUSY = "Restarting…";
export const OPEN_RELEASE_PAGE = "Open release page";
export const WHATS_NEW = "What's new";
export const TRY_AGAIN = "Try again";

/** The status bar item's accessible name; its icon is hidden from screen readers. */
export const itemName = (version: string) => `Halonic ${version} is ready. ${RESTART_TO_UPDATE}`;

/** Said once, politely, when a download ends. */
export const announceReady = (version: string) =>
  `Halonic ${version} is ready to install. ${RESTART_TO_UPDATE}.`;
export const announceDownloading = (version: string) => `Downloading Halonic ${version}.`;

export const installsOnQuit = (version: string) =>
  `Or keep working: Halonic ${version} installs when you quit.`;

const runs = (count: number) => (count === 1 ? "1 run" : `${count} runs`);

/** The dialog's body for the runs a restart would stop; `running` is at least 1. */
export function runsBody({ running, waitingForYou }: RestartRuns): string {
  if (waitingForYou === 0) {
    return running === 1
      ? "1 run is still running. Restarting stops it. You can run it again afterwards."
      : `${running} runs are still running. Restarting stops them. You can run them again afterwards.`;
  }
  // Wording marked new in flow-install-update 8 for one run, and for several waiting runs.
  if (running === 1) {
    return "1 run is still running, and it's waiting for you. Restarting stops it. You can run it again afterwards.";
  }
  const waiting =
    waitingForYou === 1 ? "1 that's waiting for you" : `${waitingForYou} that are waiting for you`;
  return `${running} runs are still running, including ${waiting}. Restarting stops them.`;
}

export const confirmLabel = (running: number) => `Restart and stop ${runs(running)}`;

export const updatedTo = (version: string) => `Updated to Halonic ${version}`;
export const didNotInstall = (version: string, current: string) =>
  `Halonic ${version} didn't install. You're still on ${current}.`;
export const SECOND_FAILURE = "Download it from the release page.";
