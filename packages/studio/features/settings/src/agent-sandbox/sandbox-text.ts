/**
 * The words of Settings › Agent sandbox: microcopy 13.1, 8.5 and 15.3 as the S1 checklist
 * (HAL-1444, section 1) quotes them. The reasons after a colon are sentences from the host or the
 * check; an exit code never stands alone.
 */
export const SECTION_TITLE = "Agent sandbox";

export const SET_UP = "Set up the sandbox";
export const REPAIR = "Repair the sandbox";
export const REMOVE = "Remove the sandbox…";
export const TRY_AGAIN = "Try again";
export const CHECK_AGAIN = "Check again";
export const BUSY_SET_UP = "Setting up…";
export const BUSY_REPAIR = "Repairing…";

export const ADMIN_ONCE = "Windows asks for administrator rights once.";
export const REPAIR_HINT =
  "Windows asks for administrator rights once. Your agents and workspaces don't change.";
export const VIEW_ONLY = "View only here. Set up the sandbox on the computer running Halonic.";

export const NOT_AVAILABLE =
  "The sandbox isn't available on this computer, so agents can't run in it. You can run an agent on this computer after a warning.";
export const NEEDS_SETUP =
  "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.";
export const needsRepair = (reason: string) =>
  `The sandbox is set up, but part of it is missing or out of date: ${reason} Until it's repaired, agents set to run in a sandbox don't start.`;
export const cannotCheck = (reason: string) => `Couldn't check the sandbox: ${reason}`;

export const UAC_WAITING =
  "Windows is asking for administrator rights. Check the taskbar if you don't see the request.";
export const STEP_SETTING_UP = "Setting up the agent sandbox…";
export const STEP_SET_UP = "Set up the agent sandbox";
export const STEP_CHECKING = "Checking the agent sandbox";
export const STEP_REPAIRING = "Repairing the agent sandbox…";
export const STEP_REPAIRED = "Repaired the agent sandbox";
export const STEP_REMOVING = "Removing the agent sandbox…";

export const DENIED =
  "The sandbox isn't set up: Windows didn't give Halonic administrator rights. If you don't have an administrator password, ask whoever manages this computer.";
export const failedSetUp = (reason: string) => `The sandbox isn't set up: ${reason}`;
export const TOOK_TOO_LONG = "The sandbox isn't set up: the setup didn't finish within 3 minutes.";
export const failedCheck = (reason: string) =>
  `The sandbox was set up, but didn't pass its check: ${reason}`;

export const REMOVE_TITLE = "Remove the agent sandbox?";
export const REMOVE_BODY =
  "Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once.";
export const REMOVE_CONFIRM = "Remove sandbox";
export const REMOVE_CANCEL = "Cancel";
export const REMOVE_DENIED =
  "The sandbox wasn't removed: Windows didn't give Halonic administrator rights.";
export const removeFailed = (reason: string) => `The sandbox wasn't removed: ${reason}`;
export const removeInUse = (runs: number) =>
  `The sandbox wasn't removed: ${runs === 1 ? "1 run is" : `${runs} runs are`} using it. Stop it or let it finish, then try again.`;

/** What is said once when a setup or repair ends, in the section's live region. */
export const announceReady = (checkedAt: string) => `Sandbox set up. Checked ${checkedAt}.`;
export const announceStep = (step: string) => step;

/** The toasts for a result that ends while Settings is closed. */
export const TOAST_SET_UP = "The agent sandbox is set up";
export const toastNotSetUp = (cause: string) => `The agent sandbox isn't set up: ${cause}`;
export const toastNotRemoved = (cause: string) => `The agent sandbox wasn't removed: ${cause}`;
