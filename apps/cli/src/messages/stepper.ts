import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The sentences of `halonic stepper guide`. The guide's own lines come from
 * `renderManualGuide` in `@halonicjs/action-steppers`, not from here, so
 * Studio and the CLI show the same guide.
 */
export const stepperMessages = defineMessages("stepper", {
  summary: () => phrase`Work with stepper requests, the user-only actions agents ask for`,
  guideSummary: () => phrase`Print the manual guide of a stepper request, for a Paperclip card`,
  /** What `stepper guide` was doing, for "✕ Couldn't print the manual guide: …". */
  guideAction: () => phrase`print the manual guide`,
  guideNeedsFile: () => phrase`halonic stepper guide needs one stepper request file.`,
  guideUsage: () => phrase`halonic stepper guide <file>`,
  noFile: (path: string) => phrase`there's no file ${path}.`,
  noFileFix: () =>
    phrase`Check the file name. It's looked for from the folder you ran the command in.`,
  isFolder: (path: string) => phrase`${path} is a folder, not a file.`,
  unreadable: (path: string) => phrase`${path} can't be read.`,
  unreadableFix: () => phrase`Check the file's permissions.`,
  /** The request didn't validate; each reason follows on its own line. */
  refused: (count: number) =>
    phrase`the stepper would refuse this request, for ${count === 1 ? "this reason" : `these ${count} reasons`}:`,
  refusedReason: (reason: string) => phrase`  ${reason}`,
  refusedFix: () =>
    phrase`Fix the request so it validates, then run halonic stepper guide again. A card can't carry a guide for a request the stepper refuses.`,
});
