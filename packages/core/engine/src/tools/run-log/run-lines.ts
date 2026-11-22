import { fenceUntrusted } from "@halonicjs/app";
import { type RunEvent, upgradeEvent } from "@halonicjs/events";
import { shortText } from "../tool-args.ts";

// Arguments and results can be long; the model gets the start of them.
const maxValueText = 200;

/**
 * A text of the log that a model, a server or someone outside the workspace
 * may have written: a tool call's arguments and result, or why a run
 * failed. It is cut first, then fenced as untrusted, so the closing marker
 * is always kept. A model reading the log reads it, but doesn't follow it.
 */
function fencedValue(value: unknown): string {
  return fenceUntrusted(shortText(value, maxValueText));
}

/**
 * A run's events as `read_run` shows them: one line per event that says
 * something to a model reading the history, indented under the state and
 * the agent, and each provider note once, under the first model call that
 * had it. Other events, and the full texts and context, are left out. Tool
 * arguments, results and a run's error are fenced ({@link fencedValue}), so
 * such a "line" spans the fence's lines.
 */
export function runLines(events: readonly RunEvent[]): string[] {
  const lines: string[] = [];
  const shownNotes = new Set<string>();
  for (const stored of events) {
    const event = upgradeEvent(stored);
    const line = eventLine(event);
    if (line !== null) {
      lines.push(line);
    }
    if (event.type === "llm.response") {
      lines.push(...newNoteLines(event.notes ?? [], shownNotes));
    }
  }
  return lines;
}

/** The lines of the notes not shown yet, which it then counts as shown. */
function newNoteLines(notes: readonly string[], shownNotes: Set<string>): string[] {
  const lines: string[] = [];
  for (const note of notes) {
    if (shownNotes.has(note)) continue;
    shownNotes.add(note);
    lines.push(`    note: ${note}`);
  }
  return lines;
}

function eventLine(event: RunEvent): string | null {
  switch (event.type) {
    case "state.entered":
      return `state ${event.state}`;
    case "agent.started":
      return `  agent ${event.agent}${event.parent === undefined ? "" : ` (for ${event.parent})`}`;
    case "llm.response": {
      const cost = event.cost === undefined ? "" : `, cost ${event.cost.toFixed(4)}`;
      const tokens = `${event.usage.inputTokens}+${event.usage.outputTokens} tokens`;
      return `  model ${event.model}: ${tokens}${cost}, ${event.latencyMs} ms`;
    }
    case "tool.called":
      return `  tool ${event.tool} ${fencedValue(event.args)}`;
    case "tool.result":
      return `    -> ${fencedValue(event.result)}`;
    // Wording: Sofia, HAL-5582.
    case "tool.unasked":
      return `  Ran without asking: \`${event.tool}\` is in your workspace's \`read\` list.`;
    case "approval.requested":
      return `  waits for approval of ${event.tool}`;
    case "approval.resolved":
      return `  ${event.approved ? "approved" : "rejected"}${event.comment ? " with comment" : ""}`;
    case "run.waiting":
      return `waiting for ${event.events.join(", ")}`;
    case "run.completed":
      return "completed";
    case "run.failed":
      return `failed: ${fenceUntrusted(event.error)}`;
    case "run.cant-try":
      return `couldn't try: ${event.cantTry.map((found) => found.step ?? found.item).join(", ")}`;
    default:
      return null;
  }
}
