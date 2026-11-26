import type { RunEvent, RunEventType } from "./run-event.ts";
import { continueEvent } from "./run-limit-waiting.ts";
import type { RunViewEvent, RunViewMarks } from "./run-view.ts";
import { runViewFailureOf } from "./run-view-failure.ts";
import { upgradeEvent } from "./upgrade.ts";

/** How one event kind shows in the run view: the fields it keeps, or `null` to leave it out. */
type Shown<Type extends RunEventType> = (
  event: Extract<RunEvent, { type: Type }>,
  marks: RunViewMarks,
) => RunViewEvent | null;

/**
 * Every event kind, shown or hidden (requirement `events.run-view`). The type names each kind,
 * so a new kind doesn't compile until someone decides how it shows. Each shown kind copies its
 * allowed fields one by one; nothing is spread from the event.
 */
const eventKinds: { readonly [Type in RunEventType]: Shown<Type> | "hidden" } = {
  "run.started": (event, marks) => {
    const message = firstMessageOf(event.input, marks);
    if (message === null) return { seq: event.seq, at: event.at, kind: "started" };
    return { seq: event.seq, at: event.at, kind: "message", from: "you", text: message };
  },
  "agent.finished": (event, marks) => {
    const text = userFacingAnswerOf(event, marks);
    if (text === null) return null;
    return { seq: event.seq, at: event.at, kind: "message", from: "product", text };
  },
  "event.received": (event, marks) => {
    const text = event.event === marks.messageEvent ? messageTextOf(event.payload) : null;
    if (text === null) return { seq: event.seq, at: event.at, kind: "answered" };
    return { seq: event.seq, at: event.at, kind: "message", from: "you", text };
  },
  "artifact.created": (event, marks) => {
    if (!marks.results.includes(event.name)) return null;
    const file = { name: event.name, mediaType: event.mediaType, size: event.size };
    return { seq: event.seq, at: event.at, kind: "file", file };
  },
  "run.waiting": (event) => ({ seq: event.seq, at: event.at, kind: "waiting" }),
  "run.limit-waiting": (event) => ({ seq: event.seq, at: event.at, kind: "waiting" }),
  "approval.requested": (event) => ({ seq: event.seq, at: event.at, kind: "waiting" }),
  "approval.resolved": (event) => ({ seq: event.seq, at: event.at, kind: "answered" }),
  "run.completed": (event) => ({ seq: event.seq, at: event.at, kind: "completed" }),
  "run.failed": (event) => {
    const failure = runViewFailureOf(event.reason, event.cause);
    return { seq: event.seq, at: event.at, kind: "failed", failure };
  },
  "run.cant-try": (event) => {
    return { seq: event.seq, at: event.at, kind: "failed", failure: { cause: "other" } };
  },
  // Prompts and instructions.
  "agent.started": "hidden",
  "harness.instructions": "hidden",
  // Model, tool, sandbox and harness setup.
  "llm.request": "hidden",
  "llm.response": "hidden",
  "llm.fallback": "hidden",
  "llm.skipped": "hidden",
  "bridge.failed": "hidden",
  "harness.allowed": "hidden",
  "harness.started": "hidden",
  "harness.stopped": "hidden",
  "agent.answer-retried": "hidden",
  "sandbox.started": "hidden",
  "sandbox.opened": "hidden",
  "sandbox.off": "hidden",
  "sandbox.blocked": "hidden",
  "key-origin.asked": "hidden",
  "key-origin.answered": "hidden",
  // Tool calls, their arguments and results.
  "tool.called": "hidden",
  "tool.result": "hidden",
  "tool.refused": "hidden",
  "tool.unasked": "hidden",
  "effect.requested": "hidden",
  "connector.started": "hidden",
  "connector.listing-failed": "hidden",
  "connector.part-off": "hidden",
  // Internal steps, child runs and context.
  "state.entered": "hidden",
  transition: "hidden",
  "signal.sent": "hidden",
  "timer.fired": "hidden",
  "workflow.started": "hidden",
  "workflow.resumed": "hidden",
  "workflow.finished": "hidden",
  "context.updated": "hidden",
  "knowledge.searched": "hidden",
};

/** The longest message text the view carries; a longer one is cut. */
export const maxRunViewMessageLength = 20_000;

/**
 * The events of a run as an end user sees them (requirement `events.run-view`), in log order.
 * An event kind the table doesn't know, such as one from a newer log, is left out, and so is a
 * received event the run wasn't waiting for.
 */
export function toRunViewEvents(events: readonly RunEvent[], marks: RunViewMarks): RunViewEvent[] {
  const shown: RunViewEvent[] = [];
  // The events the run accepts while it waits: an `event.received` shows only when it answers
  // one of them, so a webhook's or a signal's event never reads as the end user's answer.
  let accepted: readonly string[] = [];
  for (const raw of events) {
    const event = upgradeEvent(raw);
    if (event.type === "event.received" && !accepted.includes(event.event)) continue;
    accepted = acceptedAfter(event, accepted);
    const viewEvent = runViewEventOf(event, marks);
    if (viewEvent !== null) shown.push(viewEvent);
  }
  return shown;
}

/** What the run accepts after this event, as `summarize` tracks it. */
function acceptedAfter(event: RunEvent, accepted: readonly string[]): readonly string[] {
  switch (event.type) {
    case "run.waiting":
      return event.events;
    case "run.limit-waiting":
      return [continueEvent];
    case "event.received":
    case "workflow.finished":
    case "workflow.resumed":
    case "timer.fired":
    case "run.completed":
    case "run.failed":
    case "run.cant-try":
      return [];
    default:
      return accepted;
  }
}

function runViewEventOf(event: RunEvent, marks: RunViewMarks): RunViewEvent | null {
  if (!Object.hasOwn(eventKinds, event.type)) return null;
  const shown = eventKinds[event.type];
  if (shown === "hidden") return null;
  // The table is keyed by `type`, so this entry takes exactly this event's kind;
  // TypeScript can't relate the key to the entry's parameter on its own.
  return (shown as Shown<RunEventType>)(event, marks);
}

/** The end user's first message of a chat, from its start input, or `null`. */
export function firstMessageOf(
  input: Readonly<Record<string, unknown>>,
  marks: RunViewMarks,
): string | null {
  if (marks.messageInput === undefined) return null;
  const message = input[marks.messageInput];
  return typeof message === "string" ? message.slice(0, maxRunViewMessageLength) : null;
}

/** The text of a `{ text }` message payload, or `null`. */
export function messageTextOf(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("text" in payload)) return null;
  const { text } = payload;
  return typeof text === "string" ? text.slice(0, maxRunViewMessageLength) : null;
}

/**
 * The final answer of a step marked user-facing: the text of its own agent, not a subagent's,
 * when it answered with text. `null` for any other step, an error or a structured answer.
 */
export function userFacingAnswerOf(
  event: Extract<RunEvent, { type: "agent.finished" }>,
  marks: RunViewMarks,
): string | null {
  if (!marks.answerSteps.includes(event.state)) return null;
  if (event.parent !== undefined || event.error !== undefined) return null;
  if (typeof event.output !== "string") return null;
  return event.output.slice(0, maxRunViewMessageLength);
}
