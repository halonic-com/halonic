// `halonic stepper guide <file>`: prints the manual guide of a stepper
// request, for a Paperclip agent to paste into a card's body. A thin command
// over `validateStepperRequest` and `renderManualGuide`.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  renderManualGuide,
  type StepperCatalog,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  DetailedError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { phrase } from "../../messages/phrase.ts";
import { stepperMessages } from "../../messages/stepper.ts";
import { printable } from "../../output/printable.ts";

/**
 * Validates the request in the file against `catalog` and returns its guide,
 * one result line per guide line. A request the stepper would refuse gets no
 * guide: it ends with exit 2 and every reason, each naming its block.
 *
 * @throws UsageError without exactly one file
 * @throws DetailedError (`invalid_input`) when the file can't be read or the request doesn't validate
 */
export async function printManualGuide(
  input: CommandInput,
  context: CommandContext,
  catalog: StepperCatalog,
): Promise<CommandResult> {
  const [file, ...extra] = input.positionals;
  if (file === undefined || extra.length > 0) {
    throw new UsageError(stepperMessages.guideNeedsFile(), stepperMessages.guideUsage());
  }
  const checked = validateStepperRequest(await requestText(file, context.cwd), catalog);
  if (!checked.ok) throw refused(checked.error);
  const guide = renderManualGuide(checked.value, catalog);
  // The guide holds the requester's own words, so each line is made safe to print.
  const lines = guide.trimEnd().split("\n").map(printable);
  return {
    exitCode: exitCode.ok,
    lines: lines.map((line) => phrase`${line}`),
    json: { guide },
  };
}

function refused(reasons: readonly string[]): DetailedError {
  const shown = reasons.map(printable);
  return new DetailedError(
    "invalid_input",
    stepperMessages.refused(shown.length),
    stepperMessages.refusedFix(),
    { reasons: shown },
    {
      lines: shown.map((reason) => stepperMessages.refusedReason(reason).phrase),
      fix: stepperMessages.refusedFix(),
    },
  );
}

/** The file's text. A missing, folder or unreadable file is the user's to fix, so it gets a reason, not a crash. */
async function requestText(path: string, cwd: string): Promise<string> {
  try {
    return await readFile(resolve(cwd, path), "utf8");
  } catch (error) {
    const shown = printable(path);
    switch ((error as NodeJS.ErrnoException).code) {
      case "ENOENT":
        throw new DetailedError(
          "invalid_input",
          stepperMessages.noFile(shown),
          stepperMessages.noFileFix(),
        );
      case "EISDIR":
        throw new DetailedError("invalid_input", stepperMessages.isFolder(shown));
      // EPERM is what Windows gives for a file the account may not read.
      case "EACCES":
      case "EPERM":
        throw new DetailedError(
          "invalid_input",
          stepperMessages.unreadable(shown),
          stepperMessages.unreadableFix(),
        );
      default:
        throw error;
    }
  }
}
