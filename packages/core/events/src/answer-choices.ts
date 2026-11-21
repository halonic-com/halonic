import type { RunFailureCause } from "./run-basics.ts";

/** The `code` of the cause an answer that isn't one of the step's choices gets (requirement `events.answer-choices`). */
export const answerNotAnOptionCode = "agent.answer-not-an-option";

/** The agent whose answer wasn't one of the step's choices, and those choices in the step's order. */
export interface AnswerChoices {
  readonly agent: string;
  readonly options: readonly string[];
}

/**
 * The typed cause of an `answer-not-an-option` failure: the agent and the
 * choices the engine checked its answer against, never the answer itself. A
 * cause's `detail` holds strings only, so the choices go in as one JSON array.
 *
 * @example
 * answerNotAnOptionCause({ agent: "sorter", options: ["refund", "spam"] });
 * // { kind: "invalid_input", code: "agent.answer-not-an-option",
 * //   detail: { agent: "sorter", options: '["refund","spam"]' } }
 */
export function answerNotAnOptionCause({ agent, options }: AnswerChoices): RunFailureCause {
  return {
    kind: "invalid_input",
    code: answerNotAnOptionCode,
    detail: { agent, options: JSON.stringify(options) },
  };
}

/**
 * Reads the agent and the choices back from a cause. It never throws: any
 * other cause, or one whose `detail` isn't as {@link answerNotAnOptionCause}
 * writes it, reads as `undefined`, so a screen keeps its plain line.
 *
 * @example
 * answerChoicesOf(summary.cause); // { agent: "sorter", options: ["refund", "spam"] }
 * answerChoicesOf({ kind: "internal" }); // undefined
 */
export function answerChoicesOf(cause: RunFailureCause | undefined): AnswerChoices | undefined {
  if (cause?.code !== answerNotAnOptionCode) return undefined;
  const agent = cause.detail?.["agent"];
  const options = optionsFrom(cause.detail?.["options"]);
  return agent === undefined || agent === "" || options === undefined
    ? undefined
    : { agent, options };
}

/** A JSON array of one or more strings, as the cause holds the choices; `undefined` for anything else. */
function optionsFrom(json: string | undefined): readonly string[] | undefined {
  if (json === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((option) => typeof option === "string")
    ? (parsed as string[])
    : undefined;
}
