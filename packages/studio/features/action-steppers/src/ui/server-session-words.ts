/**
 * Every word of "Run with Claude" (`action-steppers.run-with-claude`), in one place for the design
 * check (plan on HAL-17834, section 1). Names, hosts and reasons are filled in as plain text.
 */

/** The button on the item, and the confirm screen's main button. */
export const runWithClaude = "Run with Claude";

/** The item's button while no server is set: it opens Settings. */
export const setUpFirst = "Set up your server in Settings first";

/** The item's button while the server in Settings is set but refused: it opens Settings. */
export const fixInSettings = "Fix your server in Settings";

/** Under that button when the server in Settings is set but refused. */
export function serverRefused(reason: string): string {
  return `Your server in Settings can't be used: ${reason}.`;
}

/** The confirm screen's heading. */
export function confirmHeading(host: string): string {
  return `Run with Claude on ${host}`;
}

/** The line under the heading, around the `user@host` in code. */
export const confirmLine = {
  before: "Claude Code will start on ",
  after: " with your access there, and follow the brief below.",
} as const;

/** Above the brief: whose words they are. */
export function writtenBy(requester: string): string {
  return `Written by ${requester}, not checked by Halonic`;
}

/** The disclosure with the launcher the shell writes. */
export const showCommands = "Show the commands that will run";
export const hideCommands = "Hide the commands";

/** Under the buttons: the shell's own window comes next. */
export const askedAgain = "Halonic asks you once more in its own window before anything starts.";

export const cancel = "Cancel";

/** After the shell opened the terminal. */
export function started(task: string): string {
  return `Claude Code is starting in a terminal. It reports back on ${task}.`;
}

/** After the user pressed Cancel in the shell's window. */
export const cancelledInShell = "Nothing was started.";

/** When the shell refused. The reason never holds a path or the brief. */
export function shellRefused(reason: string): string {
  return `Halonic didn't start it: ${reason}.`;
}

/** The refusal's reason when the desktop app threw instead of answering. */
export const desktopAppFailed = "the desktop app couldn't open the session";

/** The manual guide's title, and why it shows instead of the button. */
export const guideTitle = "Start it yourself";
export const noTerminal = "Halonic found no terminal on this computer.";
export const cannotOpenTerminal = "Halonic can't open a terminal for you on this computer.";

/** The manual guide's three steps, numbered by the list; `claude` sits in code between the halves. */
export const guideSteps = {
  connect: "Open a terminal and run this command:",
  claude: { before: "On the server, run ", after: "." },
  paste: "Paste the brief as your first message.",
} as const;

/** The Copy button's name for screen readers. */
export const copyBrief = "Copy the brief";
