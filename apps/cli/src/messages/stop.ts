import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * The line a command ends with when Ctrl C or SIGTERM stopped it (cli-output
 * 1.5). What that meant comes from the command, such as "The run 01JD… was
 * cancelled after the step Classify. Nothing after it ran."
 */
export const stopMessages = defineMessages("stop", {
  stopped: (meaning?: Phrase) =>
    meaning === undefined ? phrase`Stopped.` : phrase`Stopped. ${meaning}`,
});
