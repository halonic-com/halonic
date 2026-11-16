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
export const notReady = (reason: string) => `The sandbox isn't ready: ${reason}`;
export const RESTART_NEEDED =
  "Windows needs to restart to finish setting up the sandbox. Restart Windows, then press Check again.";
/** W2 (HAL-7373): a warning, never "vulnerable" or "unsafe". The section has no update button yet. */
export const SECURITY_UPDATES_OVERDUE = "Security updates for the agent sandbox are overdue.";
export const CHECKING = "Checking the sandbox…";
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
export const REPAIR_TOOK_TOO_LONG =
  "The sandbox isn't repaired: the repair didn't finish within 3 minutes.";
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
  `The sandbox wasn't removed: ${runs === 1 ? "1 run is using it. Stop it or let it finish" : `${runs} runs are using it. Stop them or let them finish`}, then try again.`;

/** What is said once when a setup or repair ends, in the section's live region. */
export const announceReady = (checkedAt: string) => `Sandbox set up. Checked ${checkedAt}.`;
export const announceChecked = (line: string) => `Sandbox checked: ${line}`;
export const announceStep = (step: string) => step;

/** The toasts for a result that ends while Settings is closed. */
export const TOAST_SET_UP = "The agent sandbox is set up";
export const toastNotSetUp = (cause: string) => `The agent sandbox isn't set up: ${cause}`;
export const toastNotRemoved = (cause: string) => `The agent sandbox wasn't removed: ${cause}`;

export const TOAST_SETTING_UP = "Setting up the agent sandbox…";
export const SET_UP_COMMAND = "Set up the agent sandbox";
export const OPEN_SETTINGS = "Open Settings";
export const DENIED_CAUSE = "Windows didn't give Halonic administrator rights.";
export const TIMED_OUT_CAUSE = "the setup didn't finish within 3 minutes.";
export const RESTART_CAUSE = "Windows needs to restart to finish the setup.";

/** When the check after a setup still doesn't pass and the host gave no reason. */
export const STILL_NEEDS_SETUP = "the check still says the sandbox needs setting up.";

/** The first line, and **New agents run** under the status (microcopy ST 9.1). */
export const FIRST_LINE =
  "Agents run in a sandbox unless you choose otherwise. There they can only write to their working folder, and the network is off.";
export const NEW_AGENTS_RUN = "New agents run";
export const RUN_IN_SANDBOX = "In a sandbox (recommended)";
export const RUN_ON_THIS_COMPUTER = "On this computer";
export const NEW_AGENTS_HINT =
  "Each agent can be changed on its Harness page. This applies on this computer only.";
export const NEW_AGENTS_VIEW_ONLY =
  "View only here. Change where agents run on the computer running Halonic.";
export const newAgentsNotSaved = "Couldn't save where new agents run on this computer.";

export const RUN_HERE_TITLE = "Run new agents on this computer?";
export const RUN_HERE_BODY =
  "New agents will have your access to files and the network, without the sandbox. Agents you already have keep their setting. This applies on this computer only.";
export const RUN_HERE_CONFIRM = "Run new agents on this computer";
export const NEW_AGENTS_NOT_LOADED = "Couldn't load where new agents run on this computer.";

/** Remove sandbox setup (HAL-10974): the three-step dialog, in the words HAL-11015 settled. */
export const WSL_REMOVE_LINE =
  "Deletes Halonic's sandbox from this computer. You can set it up again later.";
export const WSL_REMOVE_BUTTON = "Remove sandbox setup";
export const WSL_REMOVE_TITLE = "Remove sandbox setup";
export const WSL_REMOVE_EXPLAIN =
  "Halonic will delete its sandbox and everything stored inside it, such as tools and files the agents installed there. Your workspaces on Windows are not touched.";
export const WSL_REMOVE_EXPLAIN_AGENTS =
  "Agents that need the sandbox cannot run until you set it up again.";
export const WSL_CONTINUE = "Continue";
export const WSL_BACK = "Back";
export const WSL_CHOICE_TITLE = "What should happen to the sandbox contents?";
export const WSL_CHOICE_BACKUP = "Save a backup, then remove";
export const WSL_CHOICE_BACKUP_HELP =
  "Halonic saves a copy to a file you choose, then removes the sandbox. If saving fails, nothing is removed.";
export const WSL_CHOICE_NO_BACKUP = "Remove without a backup";
export const WSL_CHOICE_NO_BACKUP_HELP =
  "The contents are gone for good. There is no way to get them back.";
export const WSL_CHOICE_CANCEL = "Cancel";
export const WSL_CHOICE_CANCEL_HELP = "Keep the sandbox as it is.";
export const WSL_CHOOSE_LOCATION = "Choose location…";
export const WSL_CHOOSE_ANOTHER = "Choose another location";
export const wslSaveTo = (file: string) => `Save to: ${file}`;
export const wslBackupName = (date: string) => `halonic-sandbox-backup-${date}.tar`;
export const WSL_CONFIRM_NONE = "Remove sandbox";
export const WSL_CONFIRM_BACKUP = "Save backup and remove sandbox";
export const WSL_CONFIRM_NO_BACKUP = "Remove sandbox without a backup";
export const WSL_BUSY_BACKUP = "Saving backup…";
export const WSL_BUSY_BACKUP_NOTE = "This can take a few minutes. Keep Halonic open.";
export const WSL_BUSY_CONTINUE = "Continuing…";
export const WSL_BUSY_CLOSE = "Closing…";
export const WSL_BUSY_REMOVE = "Removing the sandbox…";
export const WSL_STARTED = "Removal has started and can't be stopped.";
export const WSL_DONE_TITLE = "Sandbox removed";
export const wslDoneBackup = (file: string) => `Your backup is saved at ${file}.`;
export const WSL_DONE_NO_BACKUP = "Halonic's sandbox is gone from this computer.";
export const WSL_SHOW_IN_FOLDER = "Show in folder";
export const WSL_DONE = "Done";
export const WSL_CLOSE = "Close";
export const WSL_TRY_AGAIN = "Try again";
export const WSL_BACKUP_FAILED_TITLE = "The backup didn't work, so nothing was removed";
export const wslBackupFailed = (file: string, reason: string) =>
  `Halonic could not save the backup to ${file}. Your sandbox is unchanged. ${reason}`;
export const WSL_REMOVE_FAILED_TITLE = "The sandbox could not be removed";
export const wslRemoveFailedBackup = (file: string, reason: string) =>
  `Your backup is saved at ${file}. Halonic could not remove the sandbox. ${reason}`;
export const wslRemoveFailed = (reason: string) =>
  `Halonic could not remove the sandbox. ${reason}`;
export const WSL_SHOW_BACKUP = "Show backup in folder";
export const WSL_REASON_FALLBACK =
  "Something went wrong. Close other programs that use the sandbox and try again.";
export const WSL_REFUSED_TITLE = "The sandbox was not removed";
export const WSL_REFUSED_NOT_OURS =
  "This sandbox was not set up by Halonic, so Halonic leaves it alone. Nothing was removed.";
export const WSL_REFUSED_MISSING =
  "There is no Halonic sandbox on this computer. Nothing was removed.";
export const WSL_REFUSED_FILE =
  "That backup location can't be used. Nothing was removed. Choose another location.";
export const WSL_DETAILS = "Details";
