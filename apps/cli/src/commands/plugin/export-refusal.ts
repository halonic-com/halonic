// The refusals `plugin add` ends with when a source is refused, including a
// git export that was refused or failed. git's own message can run over
// several lines, with Windows line ends too, and each is shown as a line of
// its own, not as escape codes on one line (HAL-16503).

import { GitHardeningIgnoredError } from "@halonicjs/adapter-git";
import { KindedError } from "@halonicjs/std";
import { OwnLineError } from "../../command.ts";
import type { Message } from "../../messages/define.ts";
import { type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";

/** "Couldn't add the plugin: <reason>", then the fix: "Check the folder or git address." unless another is given, none for `null`. */
export function refusal(
  reason: Phrase,
  fix: Message | null = pluginMessages.refusedSourceFix(),
): KindedError {
  return new KindedError("invalid_input", plainText(reason), {
    ...(fix === null ? {} : { fix: plainText(fix.phrase) }),
  });
}

/**
 * A refused or failed export as the refusal `plugin add` ends with. A git
 * that drops Halonic's git settings isn't the address's fault, so it gets
 * run's fix instead of "Check the folder or git address.".
 *
 * A message of more than one line, such as git's "Host key verification
 * failed." and "fatal: Could not read from remote repository.", shows its
 * first line on line 1 and the others under it in the terminal. `--json`
 * keeps line 1 and gets every line in `gitSaid`.
 */
export function exportRefusal(error: unknown): KindedError {
  if (error instanceof GitHardeningIgnoredError) {
    return new KindedError(
      "unavailable",
      plainText(pluginMessages.gitNotItself(printable(error.git)).phrase),
      {
        fix: plainText(runMessages.gitNotItselfFix().phrase),
        cause: error,
      },
    );
  }
  const reason = error instanceof Error ? error.message : String(error);
  const [first = "", ...rest] = linesOf(reason);
  if (rest.length === 0) return refusal(phrase`${printable(first)}`);
  const fix = pluginMessages.refusedSourceFix();
  return new OwnLineError(
    "invalid_input",
    pluginMessages.gitFailed(printable(first)),
    fix,
    { gitSaid: [first, ...rest] },
    { lines: rest.map((line) => phrase`${printable(line)}`), fix },
  );
}

/** The lines of `text` that aren't blank, trimmed, for any line end git writes. */
function linesOf(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
