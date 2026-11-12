import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * `halonic sandbox setup` and `remove` (HAL-1451). The steps and outcomes are
 * microcopy 13.1's, as Settings › Agent sandbox shows them (UX checklist on
 * HAL-1444, 1.3, 1.4, 1.6 and 1.10). The questions, the no-terminal lines
 * and the other-systems line are new, for Maya.
 */
export const sandboxSetupMessages = defineMessages("sandboxSetup", {
  summary: () => phrase`Set up or remove the agent sandbox on Windows`,
  setupSummary: () => phrase`Set up the agent sandbox, with one administrator prompt`,
  removeSummary: () => phrase`Remove the agent sandbox, with one administrator prompt`,
  /** What `sandbox setup` was doing, for "✕ Couldn't set up the agent sandbox: …". */
  setupAction: () => phrase`set up the agent sandbox`,
  removeAction: () => phrase`remove the agent sandbox`,
  yesOption: () => phrase`Don't ask first. Windows still asks for administrator rights.`,

  setupQuestion: () =>
    phrase`Set up the agent sandbox? Windows asks for administrator rights once.`,
  removeQuestion: () =>
    phrase`Remove the agent sandbox? Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once.`,
  setupNoTerminal: () =>
    phrase`Setting up the sandbox asks Windows for administrator rights, and there's no terminal to ask you first.`,
  removeNoTerminal: () =>
    phrase`Removing the sandbox asks Windows for administrator rights, and there's no terminal to ask you first.`,
  noTerminalFix: () => phrase`To go ahead anyway, pass --yes.`,
  notSetUp: () => phrase`Not set up. Nothing changed.`,
  notRemoved: () => phrase`Not removed. The sandbox is still set up.`,
  /** Linux and macOS: their sandbox needs no setup. */
  onlyWindows: () =>
    phrase`Only Windows needs this setup. To see whether the sandbox works on this computer, run halonic doctor.`,

  /** The live line while Windows' prompt is up. */
  settingUp: () =>
    phrase`Setting up the agent sandbox… Windows is asking for administrator rights.`,
  removing: () => phrase`Removing the agent sandbox… Windows is asking for administrator rights.`,
  setUp: () => phrase`Set up the agent sandbox`,
  checked: () => phrase`Checked the agent sandbox`,
  removed: () => phrase`Removed the agent sandbox`,

  cancelled: () =>
    phrase`The sandbox isn't set up: Windows didn't give Halonic administrator rights. If you don't have an administrator password, ask whoever manages this computer.`,
  failed: (reason: string) => phrase`The sandbox isn't set up: ${reason}.`,
  checkFailed: (reason: string) =>
    phrase`The sandbox was set up, but didn't pass its check: ${reason}.`,
  removeCancelled: () =>
    phrase`The sandbox wasn't removed: Windows didn't give Halonic administrator rights.`,
  removeFailed: (reason: string) => phrase`The sandbox wasn't removed: ${reason}.`,
  /** The helper's exit code, after the reason, as secondary text. */
  code: (code: number) => phrase`Code ${String(code)}`,
});
