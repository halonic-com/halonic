/**
 * The words of Settings › Agent sandbox: microcopy 13.1, 8.5 and 15.3 as the S1 checklist
 * (HAL-1444, section 1) quotes them. The reasons after a colon are sentences from the host or the
 * check; an exit code never stands alone.
 */
import { SETUP_LIMIT_MINUTES } from "./setup-limit.ts";

export const SECTION_TITLE = "Agent sandbox";

export const SET_UP = "Set up the sandbox";
export const REPAIR = "Repair the sandbox";
export const REMOVE = "Remove the sandbox…";
export const TRY_AGAIN = "Try again";
export const CHECK_AGAIN = "Check again";
export const BUSY_SET_UP = "Setting up…";
export const BUSY_REPAIR = "Repairing…";

export const ADMIN_ONCE = "Windows asks for administrator rights once.";
/** In place of {@link ADMIN_ONCE} when the setup is there but older (HAL-14804, Noah). */
export const SETUP_AGAIN =
  "This version of Halonic needs the sandbox set up again. Windows asks for administrator rights once.";
export const REPAIR_HINT =
  "Windows asks for administrator rights once. Your agents and workspaces don't change.";
export const VIEW_ONLY = "View only here. Set up the sandbox on the computer running Halonic.";

export const NOT_AVAILABLE =
  "The sandbox isn't available on this computer, so Claude Code and Codex agents can't run here yet. Agents set to Halonic on their Harness page still run.";
export const NEEDS_SETUP =
  "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.";
export const needsRepair = (reason: string) =>
  `The sandbox is set up, but part of it is missing or out of date: ${reason} Until it's repaired, agents set to run in a sandbox don't start.`;
/** After a reason the check found: the way round it (23.3, 13.1's second sentence). */
export const RUN_HERE_AFTER_WARNING = "You can run an agent on this computer after a warning.";
/** Where the docs keys of the sandbox-start catalogue point, as the Inbox and the run page link. */
export const DOCS_ADDRESS = "https://docs.halonic.dev";
export const RESTART_NEEDED =
  "Windows needs to restart to finish setting up the sandbox. Restart Windows, then press Check again.";
/** W2 (HAL-7373): a warning, never "vulnerable" or "unsafe". The section has no update button yet. */
export const SECURITY_UPDATES_OVERDUE = "Security updates for the agent sandbox are overdue.";
/**
 * W6 (HAL-12445), both warnings, never failures; Noah's lines (HAL-12513). The person fixes them
 * outside Halonic, so each says how. `/mnt/wsl` is shared by every WSL distro, so Docker Desktop
 * shows whenever it runs: the line says "running next to", not "connected" (Liam, HAL-12512).
 */
export const DEFAULT_DISTRO =
  "The agent sandbox is your default WSL distribution, so typing wsl in a terminal opens it. To change this, run wsl --set-default with the name of your own distribution, for example wsl --set-default Ubuntu.";
export const DOCKER_DESKTOP_VISIBLE =
  "Docker Desktop is running next to the agent sandbox. Make sure halonic is turned off in Docker Desktop's Settings › Resources › WSL integration.";
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
export const REPAIR_TOOK_TOO_LONG = `The sandbox isn't repaired: the repair didn't finish within ${SETUP_LIMIT_MINUTES} minutes.`;
export const failedSetUp = (reason: string) => `The sandbox isn't set up: ${reason}`;
export const TOOK_TOO_LONG = `The sandbox isn't set up: the setup didn't finish within ${SETUP_LIMIT_MINUTES} minutes.`;
/**
 * Try again while the helper from an earlier press still runs: Windows isn't asked again (HAL-14841).
 * A note, not a failure, in the tone of {@link UAC_WAITING}; Noah's lines (HAL-14863).
 */
export const STILL_RUNNING = "The earlier setup is still running. Wait a minute, then try again.";
export const REPAIR_STILL_RUNNING =
  "The earlier repair is still running. Wait a minute, then try again.";
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
/**
 * The shell's time limit. Its helper may still finish the removal, and this Callout has no Try again,
 * so the line says what to do next, in the still-running note's words (C576, HAL-15430).
 */
export const REMOVE_TOOK_TOO_LONG = `The sandbox wasn't removed within ${SETUP_LIMIT_MINUTES} minutes. Wait a minute, then try again.`;
/** A removal that worked, in the WSL removal's words; the state's line says what follows (C575). */
export const REMOVED = "Sandbox removed.";
/** A removal with administrator rights that kept some access, in the uninstaller's words (HAL-15761). */
export const REMOVED_KEPT_ACCESS =
  "Its access to your project folders ends the next time you start Halonic.";
export const removedLine = (keptAccess: boolean) =>
  keptAccess ? `${REMOVED} ${REMOVED_KEPT_ACCESS}` : REMOVED;
/** A note, not a failure, as for the setup and the repair (HAL-15091). */
export const REMOVE_STILL_RUNNING =
  "The earlier removal is still running. Wait a minute, then try again.";
export const removeInUse = (runs: number) =>
  `The sandbox wasn't removed: ${runs === 1 ? "1 run is using it. Stop it or let it finish" : `${runs} runs are using it. Stop them or let them finish`}, then try again.`;

/** What is said once when a setup or repair ends, in the section's live region. */
export const announceReady = (checkedAt: string) => `Sandbox set up. Checked ${checkedAt}.`;
export const announceChecked = (line: string) => `Sandbox checked: ${line}`;
export const announceStep = (step: string) => step;
/** A removal that worked, as the WSL removal says it, then the first line of the state it left. */
export const announceRemoved = (line: string, keptAccess = false) =>
  `${removedLine(keptAccess)} ${line}`;

/** The toasts for a result that ends while Settings is closed. */
export const TOAST_SET_UP = "The agent sandbox is set up";
export const toastNotSetUp = (cause: string) => `The agent sandbox isn't set up: ${cause}`;
export const toastNotRemoved = (cause: string) => `The agent sandbox wasn't removed: ${cause}`;

export const TOAST_SETTING_UP = "Setting up the agent sandbox…";
export const SET_UP_COMMAND = "Set up the agent sandbox";
export const OPEN_SETTINGS = "Open Settings";
export const DENIED_CAUSE = "Windows didn't give Halonic administrator rights.";
export const TIMED_OUT_CAUSE = `the setup didn't finish within ${SETUP_LIMIT_MINUTES} minutes.`;
export const STILL_RUNNING_CAUSE =
  "the earlier setup is still running. Wait a minute, then try again.";
export const RESTART_CAUSE = "Windows needs to restart to finish the setup.";

/** When the check after a setup still doesn't pass and the host gave no reason. */
export const STILL_NEEDS_SETUP = "the check still says the sandbox needs setting up.";

/** The first line, and **New agents run** under the status (microcopy ST 9.1). */
export const FIRST_LINE =
  "Claude Code and Codex agents run in a sandbox. There they write only to their working folder and their own temp and settings folders, and reach only Halonic and the sites you allow.";
export const NEW_AGENTS_RUN = "New agents run";
export const RUN_IN_SANDBOX = "In a sandbox (recommended)";
export const RUN_ON_THIS_COMPUTER = "On this computer";
export const NEW_AGENTS_HINT =
  "Each agent can be changed on its Harness page. This applies on this computer only.";
/**
 * The hint's second line while this Studio can't start an agent outside its sandbox. Team
 * decision by Sofia on HAL-13232, the same fact as the Harness page's `studioCantStart`.
 */
export const NEW_AGENTS_STUDIO_CANT_START =
  "Studio can't start agents this way; halonic serve on this computer can.";
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
  "Halonic will delete its sandbox and everything stored inside it, such as tools and files the agents installed there. Your workspace files on Windows aren't touched.";
export const WSL_REMOVE_EXPLAIN_AGENTS =
  "Agents that need the sandbox can't run until you set it up again.";
export const WSL_CONTINUE = "Continue";
export const WSL_BACK = "Back";
export const WSL_CHOICE_TITLE = "What should happen to the sandbox contents?";
export const WSL_CHOICE_BACKUP = "Save a backup, then remove";
export const WSL_CHOICE_BACKUP_HELP =
  "Halonic saves a copy to a file you choose, then removes the sandbox. If saving fails, nothing is removed.";
export const WSL_CHOICE_NO_BACKUP = "Remove without a backup";
export const WSL_CHOICE_NO_BACKUP_HELP = "The contents are gone for good. You can't get them back.";
export const WSL_CHOOSE_LOCATION = "Choose location…";
export const WSL_CHOOSE_ANOTHER = "Choose another location";
export const wslSaveTo = (file: string) => `Save to: ${file}`;
export const wslBackupName = (date: string) => `halonic-sandbox-backup-${date}.tar`;
export const WSL_CONFIRM_NONE = "Remove sandbox";
export const WSL_CONFIRM_NONE_WHY = "Choose what happens to the contents first.";
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
  `Halonic couldn't save the backup to ${file}. Your sandbox is unchanged. ${reason}`;
export const WSL_REMOVE_FAILED_TITLE = "The sandbox couldn't be removed";
export const wslRemoveFailedBackup = (file: string, reason: string) =>
  `Your backup is saved at ${file}. Halonic couldn't remove the sandbox. ${reason}`;
export const wslRemoveFailed = (reason: string) => `Halonic couldn't remove the sandbox. ${reason}`;
export const WSL_SHOW_BACKUP = "Show backup in folder";
export const WSL_REASON_FALLBACK =
  "Something went wrong. Close other programs that use the sandbox and try again.";
export const WSL_REFUSED_TITLE = "The sandbox wasn't removed";
export const WSL_REFUSED_NOT_OURS =
  "This sandbox wasn't set up by Halonic, so Halonic leaves it alone. Nothing was removed.";
export const WSL_REFUSED_MISSING =
  "There is no Halonic sandbox on this computer. Nothing was removed.";
export const WSL_REFUSED_FILE =
  "That backup location can't be used. Nothing was removed. Choose another location.";
export const WSL_DETAILS = "Details";

// Plugins and integrations without the sandbox: microcopy 24.1 R16 (HAL-1949, built on HAL-3384).
export const UNFENCED_TITLE = "Plugins and integrations";
export const UNFENCED_LINE =
  "The agent sandbox runs agents' programs. On Windows, plugin and integration code can't run in it yet, so it needs your yes.";
/** R16's line for every reason but `windows`, which isn't about Windows (team decision, HAL-3384). */
export const UNFENCED_LINE_HERE =
  "The agent sandbox runs agents' programs. Plugin and integration code can't run in it on this computer, so it needs your yes.";
/**
 * Under R16's line while no yes is saved: where the yes is given, since this block has no button
 * for it (C565 row 2, HAL-15373). The yes covers every plugin, so any plugin's Review gives it.
 */
export const UNFENCED_WHERE =
  "Give it from a plugin's page in Plugins: open the plugin, then Review.";
export const OPEN_PLUGINS = "Open Plugins";
export const UNFENCED_ALLOWED = "Allowed without the sandbox";
export const unfencedAllowedOn = (day: string) => `Allowed on ${day}.`;
export const TAKE_BACK = "Take back";
export const BUSY_TAKE_BACK = "Taking back…";
export const TAKE_BACK_HINT =
  "Taking it back stops plugins and integrations that run without the sandbox. Halonic asks again the next time one starts.";
export const TAKEN_BACK_TITLE = "Taken back.";
/** Keeps the hint's "asks again" once the hint is gone with the button: it says where (C587, HAL-15527). */
export const TAKEN_BACK_TEXT =
  "Plugins and integrations won't start without the sandbox until you allow it again. Halonic asks again the next time one starts.";
/** The host's `take_back_incomplete`: the yes is gone, but some runners didn't stop (HAL-15527). */
export const TAKEN_BACK_PARTLY_TITLE = "Taken back, but some plugins and integrations didn't stop.";
/** A Take back the host refused; the toast's text is the shell's reason for the error (C553, HAL-15227). */
export const TAKE_BACK_FAILED_TITLE = "Couldn't take it back";
/** The agent host's refusals of a Take back, in plain words; any other kind gets the shell's reason (C587, HAL-15527). */
export const TAKE_BACK_HOST_REASONS: Readonly<Record<string, string>> = {
  take_back_failed: "Halonic couldn't remove the saved yes.",
  io: "Halonic couldn't write to your profile folder.",
};
/** After a refused Take back, only when the status read again still shows the yes (C587, HAL-15527). */
export const YES_STILL_SAVED = "The yes is still saved.";
/** The host couldn't say whether a yes is saved: claims no yes, offers Try again (C553, HAL-15227). */
export const UNFENCED_NOT_READ =
  "Couldn't check whether plugins and integrations may run without the sandbox.";
