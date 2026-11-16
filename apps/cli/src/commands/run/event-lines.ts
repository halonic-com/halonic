// What `halonic run --json --follow` prints while the run goes: one JSON
// line for each event of the run's log, as it happens (requirement
// `cli.json-lines`). The command's result follows as the last line.

import type { RunEvent } from "@halonicjs/events";
import type { CommandContext } from "../../command.ts";

/**
 * Passes each event to `context.printJsonLine`, once. Every follow of a run
 * reads its log from the first event, so one that follows on after an
 * `--event` meets the events it already printed: those are skipped by their
 * `seq`.
 *
 * @example
 * const onEvent = eventLines(context);
 * await workflowRuns.startRun(workspace, "support-reply", input, { onEvent });
 * // {"outputVersion":1,"event":{"seq":1,"type":"run.started",…}}
 */
export function eventLines(
  context: Pick<CommandContext, "printJsonLine">,
): (event: RunEvent) => void {
  let lastSeq = -1;
  return (event) => {
    if (event.seq <= lastSeq) return;
    lastSeq = event.seq;
    context.printJsonLine({ event });
  };
}
