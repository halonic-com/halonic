import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/** The words for a workspace's `template.yaml`, shared by `halonic serve` and `halonic init`. */
export const workspaceTemplateMessages = defineMessages("workspace-template", {
  /**
   * The `!` line for a `template.yaml` this Halonic can't read, such as one
   * from a newer version: the command goes on as if there were none.
   */
  unreadable: (line: number, reason: string) =>
    phrase`${markPart("needsYou")} Skipped template.yaml: line ${String(line)}: ${reason}. A newer Halonic may read it.`,
});
