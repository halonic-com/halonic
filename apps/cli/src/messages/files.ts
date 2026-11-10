import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * Why Halonic couldn't write a file (failure-states F9 and FS8, cli-output
 * 3.1): the reason after "Couldn't …:", the same three as Studio's save
 * errors. Any command that writes files uses them, `init` first.
 */
export const fileMessages = defineMessages("files", {
  diskFull: () => phrase`the disk is full.`,
  diskFullFix: () => phrase`Free some space, then run it again.`,
  notWritable: () => phrase`Halonic can't write to this folder.`,
  inUse: () => phrase`another app is using the file.`,
});
