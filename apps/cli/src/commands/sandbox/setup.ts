// `halonic sandbox setup` and `remove`: thin commands over SrtSandbox.setUp
// and remove, which Studio and the installer run too (HAL-1451). This file
// asks first and words the outcome; the adapter does the work.

import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Message } from "../../messages/define.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { sandboxSetupMessages as messages } from "../../messages/sandbox-setup.ts";
import type { SandboxSetter } from "./command.ts";

/**
 * Sets the agent sandbox up after asking, or straight away with `--yes`.
 * The `--json` fields are `outcome` (`ready`, `cancelled`, `failed` or
 * `check_failed`), and `reason` and `code` when there are any.
 *
 * @throws UsageError when there's no terminal to ask and no `--yes`
 */
export async function setUpSandbox(
  input: CommandInput,
  context: CommandContext,
  sandbox: SandboxSetter,
): Promise<CommandResult> {
  if (sandbox.platform !== "win32") return onlyWindows();
  const sure = await askFirst(input, context, messages.setupQuestion(), messages.setupNoTerminal());
  if (!sure) return notDone(messages.notSetUp(), "setup");
  const progress = context.progress(messages.settingUp().phrase);
  const setup = await sandbox.setUp();
  progress.end();
  if (setup.ok) {
    return {
      exitCode: exitCode.ok,
      lines: [done(messages.setUp()), done(messages.checked())],
      json: { outcome: "ready" },
    };
  }
  return { exitCode: exitCode.failed, lines: setupLines(setup), json: failedJson(setup) };
}

/**
 * Removes the agent sandbox after asking, or straight away with `--yes`.
 * The `--json` fields are `outcome` (`removed`, `cancelled` or `failed`),
 * and `reason` and `code` when there are any.
 *
 * @throws UsageError when there's no terminal to ask and no `--yes`
 */
export async function removeSandbox(
  input: CommandInput,
  context: CommandContext,
  sandbox: SandboxSetter,
): Promise<CommandResult> {
  if (sandbox.platform !== "win32") return onlyWindows();
  const other = await sandbox.otherUse();
  const sure = await askFirst(
    input,
    context,
    messages.removeQuestion(),
    messages.removeNoTerminal(),
    otherUseLines(other),
  );
  if (!sure) return notDone(messages.notRemoved(), "remove");
  const progress = context.progress(messages.removing().phrase);
  const removal = await sandbox.remove();
  progress.end();
  if (removal.ok) {
    return {
      exitCode: exitCode.ok,
      lines: [done(messages.removed())],
      json: { outcome: "removed" },
    };
  }
  const line =
    removal.outcome === "cancelled"
      ? messages.removeCancelled()
      : messages.removeFailed(removal.reason);
  return {
    exitCode: exitCode.failed,
    lines: [needsYou(line, removal.code)],
    json: failedJson(removal),
  };
}

function askFirst(
  input: CommandInput,
  context: CommandContext,
  question: Message,
  noTerminal: Message,
  shownFirst: readonly Phrase[] = [],
): Promise<boolean> {
  return context.ask({
    question,
    shownFirst,
    yes: input.options["yes"] === true,
    refusal: () => new UsageError(noTerminal, messages.noTerminalFix()),
  });
}

/**
 * The warning shown before the remove question when another program may use
 * the sandbox: srt keeps write access to folders Halonic doesn't work in, or
 * can't say (HAL-7414, S-7). Nothing otherwise.
 */
function otherUseLines(other: { folders: string[]; unknown: boolean }): Phrase[] {
  if (other.folders.length > 0) return [messages.otherUseFolders(folderList(other.folders)).phrase];
  return other.unknown ? [messages.otherUse().phrase] : [];
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more": full paths, in srt's order. */
function folderList(folders: readonly string[]): string {
  if (folders.length <= 3) {
    return folders.length < 2
      ? (folders[0] ?? "")
      : `${folders.slice(0, -1).join(", ")} and ${folders.at(-1)}`;
  }
  return `${folders.slice(0, 3).join(", ")} and ${folders.length - 3} more`;
}

/** The lines for a setup that didn't pass: the ✓ step it got through, then the ! outcome. */
function setupLines(setup: Extract<SandboxSetup, { ok: false }>): Phrase[] {
  if (setup.outcome === "cancelled") return [needsYou(messages.cancelled())];
  if (setup.outcome === "check_failed") {
    return [done(messages.setUp()), needsYou(messages.checkFailed(setup.reason), setup.code)];
  }
  return [needsYou(messages.failed(setup.reason), setup.code)];
}

function failedJson(result: Extract<SandboxSetup | SandboxRemoval, { ok: false }>) {
  return {
    outcome: result.outcome,
    reason: result.reason,
    ...(result.code === undefined ? {} : { code: result.code }),
  };
}

function onlyWindows(): CommandResult {
  return {
    exitCode: exitCode.ok,
    lines: [messages.onlyWindows().phrase],
    json: { outcome: "not_needed" },
  };
}

function notDone(line: Message, verb: "setup" | "remove"): CommandResult {
  return {
    exitCode: exitCode.failed,
    lines: [line.phrase],
    json: { outcome: verb === "setup" ? "not_set_up" : "not_removed" },
  };
}

function done(line: Message): Phrase {
  return phrase`${markPart("done")} ${line.phrase}`;
}

/** A ! line, with the helper's code after it as secondary text when there is one. */
function needsYou(line: Message, code?: number): Phrase {
  const after = code === undefined ? [] : [" ", ...dimmed(messages.code(code).phrase)];
  return [...phrase`${markPart("needsYou")} ${line.phrase}`, ...after];
}
