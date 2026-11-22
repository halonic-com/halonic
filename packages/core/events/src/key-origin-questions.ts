import type { RunEvent } from "./run-event.ts";
import type { OpenKeyOriginQuestion, RunSummary } from "./run-summary.ts";

/**
 * Keep the summary's open questions "Allow this address?" up to date with one event (requirement
 * `events.summary-key-origin-asked`). A `key-origin.asked` opens one; its `key-origin.answered`
 * for the same key and address closes it. A wait that ends without an answer logs nothing, and
 * the failed call then ends the agent's turn or the step, so anything that shows a call may have
 * ended closes every open question: the step's own agent starting a new turn, any agent
 * finishing, the run entering a step, starting to wait or ending. Other events, such as a
 * subagent's model call or a tool call, leave them open.
 */
export function followKeyOriginQuestions(summary: RunSummary, event: RunEvent): void {
  if (event.type === "key-origin.asked") {
    const asked = { provider: event.provider, key: event.key, origin: event.origin };
    summary.keyOriginAsked = [...(summary.keyOriginAsked ?? []), asked];
    return;
  }
  const open = summary.keyOriginAsked;
  if (open === undefined) return;
  const left = stillOpen(open, event);
  if (left.length === 0) delete summary.keyOriginAsked;
  else summary.keyOriginAsked = left;
}

function stillOpen(open: OpenKeyOriginQuestion[], event: RunEvent): OpenKeyOriginQuestion[] {
  if (event.type === "key-origin.answered") {
    return open.filter((asked) => asked.key !== event.key || asked.origin !== event.origin);
  }
  return endsTheCalls(event) ? [] : open;
}

/** Whether `event` shows that the questions asked before it no longer wait for an answer. */
function endsTheCalls(event: RunEvent): boolean {
  switch (event.type) {
    case "agent.started":
      return event.parent === undefined;
    // A subagent's question ends with the subagent; a wait with no question on screen would
    // send the person looking for one.
    case "agent.finished":
    case "state.entered":
    case "run.waiting":
    case "run.completed":
    case "run.failed":
    case "run.cant-try":
      return true;
    default:
      return false;
  }
}
